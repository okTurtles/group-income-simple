'use strict'

import resolve from 'rollup-plugin-node-resolve'
import commonjs from 'rollup-plugin-commonjs'
import alias from 'rollup-plugin-alias'
import babel from 'rollup-plugin-babel'
import VuePlugin from 'rollup-plugin-vue'
import flowRemoveTypes from 'flow-remove-types'
import json from 'rollup-plugin-json'
import globals from 'rollup-plugin-node-globals'
import eslint from '@rollup/plugin-eslint'
import replace from '@rollup/plugin-replace'
import sass from 'rollup-plugin-sass'
import { createFilter } from 'rollup-pluginutils'
import transpile from 'vue-template-es2015-compiler'
import { chompLeft, chompRight } from '~/shared/string.js'
import { mapObject } from '~/frontend/utils/giLodash.js'

const compiler = require('vue-template-compiler') // NOTE: import doesnt work here?
const rollup = require('rollup')
const chalk = require('chalk')
const fs = require('fs')
const path = require('path')
const util = require('util')
const bs = require('browser-sync').create('rollup')
const crypto = require('crypto')
const readFileAsync = util.promisify(fs.readFile)

const development = process.env.NODE_ENV === 'development'

const distDir = 'dist'
const distAssets = `${distDir}/assets`
const distJS = `${distAssets}/js`
const distCSS = `${distAssets}/css`

const sassOptions = {
  // https://github.com/sass/dart-sass#javascript-api
  sourceMap: development,
  outputStyle: development ? 'expanded' : 'compressed',
  includePaths: [
    path.resolve('./node_modules'), // so we can write @import 'vue-slider-component/lib/theme/default.scss'; in .vue <style>
    path.resolve('./frontend/assets/style') // so we can write @import '_variables.scss'; in .vue <style> section
    // but also for compatibility with resolveScssFromId() to prevent errors like this during the build process:
    // couldn't resolve: @import "_reset"; in group-income-simple/frontend/assets/style/main.scss
  ],
  importer (url, prev, done) {
    // so we can write @import "@assets/style/_variables.scss"; in the <style> section of .vue components too
    return url.indexOf('@assets/') !== 0
      ? null
      : { file: path.resolve('./frontend/assets', chompLeft(url, '@assets/')) }
  }
}

module.exports = (grunt) => {
  require('load-grunt-tasks')(grunt)

  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),

    checkDependencies: { this: { options: { install: true } } },

    copy: {
      html_files: {
        src: 'frontend/index.html',
        dest: `${distDir}/index.html`
      },
      assets: {
        cwd: 'frontend/assets',
        src: ['**/*', '!style/**', '!svgs/**'],
        dest: distAssets,
        expand: true
      }
    },

    // https://github.com/sindresorhus/grunt-shell is another nice alternative
    exec: {
      // could replace w/https://github.com/pghalliday/grunt-mocha-test
      // test files:
      //    - anything in /test folder, eg. integration tests
      //    - anything that ends with .test.js, eg. unit tests for sbp domains kept in the domain folder
      test: {
        cmd: 'node node_modules/mocha/bin/mocha --require Gruntfile.js --exit -R spec --bail "{./{,!(node_modules|test)/**/}*.test.js,./test/*.js}"',
        options: { env: { LOAD_NO_FILE: 'true', ...process.env } }
      },
      // https://github.com/standard/standard/issues/750#issuecomment-379294276
      eslint: 'node ./node_modules/eslint/bin/eslint.js "**/*.{js,vue}"',
      eslintgrunt: "./node_modules/.bin/eslint --ignore-pattern '!.*.js' .Gruntfile.babel.js Gruntfile.js",
      puglint: '"./node_modules/.bin/pug-lint-vue" frontend/views',
      stylelint: 'node ./node_modules/stylelint/bin/stylelint.js "frontend/assets/style/**/*.{css,scss,vue}"',
      flow: '"./node_modules/.bin/flow" --quiet || echo The Flow check failed!'
    },

    clean: { dist: [`${distDir}/*`] }
  })

  // -------------------------------------------------------------------------
  //  Grunt Tasks
  // -------------------------------------------------------------------------

  grunt.registerTask('default', ['dev'])
  grunt.registerTask('dev', ['checkDependencies', 'backend:relaunch', 'build:watch', 'keepalive'])
  grunt.registerTask('dist', ['build'])
  grunt.registerTask('test', ['build', 'backend:launch', 'exec:test', 'cypress'])
  grunt.registerTask('test:unit', ['backend:launch', 'exec:test'])

  // TODO: add 'deploy' per:
  //       https://github.com/okTurtles/group-income-simple/issues/10

  grunt.registerTask('build', function () {
    const rollup = this.flags.watch ? 'rollup:watch' : 'rollup'

    if (!grunt.option('skipbuild')) {
      grunt.task.run(['exec:eslint', 'exec:flow', 'exec:puglint', 'exec:stylelint', 'copy', rollup])
    }
  })

  grunt.registerTask('cypress', function () {
    const cypress = require('cypress')
    const done = this.async()
    const command = grunt.option('browser') === 'debug' ? 'open' : 'run'

    // https://docs.cypress.io/guides/guides/module-api.html
    const options = {
      run: {
        headed: grunt.option('browser') === true,
        ...(process.env.CYPRESS_RECORD_KEY && {
          record: true,
          key: process.env.CYPRESS_RECORD_KEY
        })
      },
      open: {
        // add cypress.open() options here
      }
    }[command]
    grunt.log.writeln(`cypress: running in "${command}" mode...`)
    cypress[command](options).then(r => done(r.totalFailed === 0)).catch(done)
  })

  // -------------------------------------------------------------------------
  //  Code for running backend server at the same time as browsersync
  // -------------------------------------------------------------------------

  let killKeepAlive = null
  grunt.registerTask('keepalive', function () {
    // this keeps grunt running after other async tasks have completed
    killKeepAlive = this.async()
  })

  grunt.registerTask('reload', function () {
    // unfortunately this doesn't seem to actually refresh browsersync with
    // the way we're using it... don't know why. Doesn't actually refresh page.
    bs.reload('index.html')
  })

  const fork = require('child_process').fork
  let child = null

  process.on('exit', () => { // 'beforeExit' doesn't work
    // In cases where 'watch' fails while child (server) is still running
    // we will exit and child will continue running in the background.
    // This can happen, for example, when running two GIS instances via
    // the PORT_SHIFT envar. If grunt-contrib-watch livereload process
    // cannot bind to the port for some reason, then the parent process
    // will exit leaving a dangling child server process.
    if (child) {
      grunt.log.writeln('Quitting dangling child!')
      child.send({ shutdown: 2 })
    }
  })

  // used with `grunt dev` only, makes it possible to restart just the server when
  // backend files are modified (in conjunction with grunt-contrib-watch)
  grunt.registerTask('backend:relaunch', '[internal]', function () {
    const done = this.async() // tell grunt we're async
    const fork2 = function () {
      grunt.log.writeln('backend: forking...')
      child = fork('Gruntfile.js', process.argv, {
        env: { LOAD_TARGET_FILE: './backend/index.js', ...process.env }
      })
      child.on('error', (err) => {
        if (err) {
          console.error('error starting or sending message to child:', err)
          process.exit(1)
        }
      })
      child.on('exit', (c) => {
        if (c !== 0) {
          grunt.log.error(`child exited with error code: ${c}`.bold)
          // ^C can cause c to be null, which is an OK error
          process.exit(c || 0)
        }
      })
      done()
    }
    if (child) {
      grunt.log.writeln('Killing child!')
      // wait for successful shutdown to avoid EADDRINUSE errors
      child.on('message', () => {
        child = null
        fork2()
      })
      child.send({ shutdown: 1 })
    } else {
      fork2()
    }
  })

  // useful helper task for `grunt test`
  grunt.registerTask('backend:launch', '[internal]', function () {
    const done = this.async()
    grunt.log.writeln('backend: launching...')
    require('./backend/index.js').then(done).catch(done)
  })

  // -----------------------
  // - Our rollup command
  // -----------------------

  grunt.registerTask('rollup', function () {
    let done = this.async()
    const watchFlag = this.flags.watch
    const sharedPlugins = {
      eslint: eslint({ throwOnError: false, throwOnWarning: false }),
      replace: replace(mapObject(process.env, ([key, value]) => {
        return [`process.env.${key}`, JSON.stringify(value)]
      }))
    }
    const watchOpts = [
      {
        input: 'frontend/controller/serviceworkers/primary.js',
        output: {
          format: 'iife',
          file: `${distJS}/sw-primary.js`,
          sourcemap: development,
          inlineDynamicImports: true
        },
        plugins: [
          sharedPlugins.eslint,
          sharedPlugins.replace
        ]
      },
      {
        input: 'frontend/main.js',
        preserveEntrySignatures: false,
        output: {
          format: 'es',
          dir: distJS,
          sourcemap: development
        },
        external: ['crypto'],
        plugins: [
          alias({
            // https://vuejs.org/v2/guide/installation.html#Standalone-vs-Runtime-only-Build
            resolve: ['.vue', '.js', '.svg', '.scss'],
            entries: {
              'vue': path.resolve('./node_modules/vue/dist/vue.esm.js'),
              '~': path.resolve('./'),
              '@controller': path.resolve('./frontend/controller'),
              '@model': path.resolve('./frontend/model'),
              '@utils': path.resolve('./frontend/utils'),
              '@views': path.resolve('./frontend/views'),
              '@pages': path.resolve('./frontend/views/pages'),
              '@components': path.resolve('./frontend/views/components'),
              '@containers': path.resolve('./frontend/views/containers'),
              '@view-utils': path.resolve('./frontend/views/utils'),
              '@assets': path.resolve('./frontend/assets'),
              '@svgs': path.resolve('./frontend/assets/svgs')
            }
          }),
          resolve({
            // we set `preferBuiltins` to prevent rollup from erroring with
            // [!] (commonjs plugin) TypeError: Cannot read property 'warn' of undefined
            // TypeError: Cannot read property 'warn' of undefined
            preferBuiltins: false
          }),
          json(),
          transformProxy({
            // NOTE: this completely ignores outFile in the sassOptions
            //       for some reason, so sourcemaps aren't generated for the SCSS :-\
            plugin: sass({ output: `${distCSS}/main.css`, options: sassOptions }),
            match: /\.scss$/,
            recurse: true
          }),
          sharedPlugins.eslint,
          svgLoader(),
          transformProxy({
            plugin: VuePlugin({
              // https://rollup-plugin-vue.vuejs.org/options.html
              // https://github.com/vuejs/rollup-plugin-vue/blob/master/src/index.ts
              // https://github.com/vuejs/vue-component-compiler#api
              needMap: false, // see: https://github.com/okTurtles/group-income-simple/pull/629
              // css: false, // to prevent loading a massive CSS file, we keep the CSS in components that can be split up
              style: {
                preprocessOptions: { scss: sassOptions }
              }
            }),
            match: /\.(scss|vue)$/,
            recurse: false
          }),
          sharedPlugins.replace,
          flow({ all: true }),
          commonjs({
            // NOTE: uncommenting this saves ~1 second off build process
            //       while making it a massive pain to deal with dependencies
            //       and causing "ReferenceError: require is not defined"
            // include: /(node_modules\/(blakejs|multihashes|tweetnacl|localforage|@babel|vue.+).*)/,
            namedExports: {
              'node_modules/vuelidate/lib/validators/index.js': ['required', 'between', 'email', 'minLength', 'requiredIf'],
              'node_modules/emoji-mart-vue-fast/dist/emoji-mart.js': ['Picker', 'EmojiIndex']
            },
            ignore: ['crypto']
          }),
          babel({
            runtimeHelpers: true,
            exclude: 'node_modules/**' // only transpile our source code
          }),
          globals(), // for Buffer support
          // run browsersync only in dev mode
          watchFlag && browsersync({
            // https://browsersync.io/docs/options
            proxy: {
              target: process.env.API_URL,
              ws: true
            },
            tunnel: grunt.option('tunnel') && `gi${crypto.randomBytes(2).toString('hex')}`,
            reloadDelay: 100,
            reloadThrottle: 2000,
            cors: true,
            open: false,
            ghostMode: false,
            logLevel: grunt.option('debug') ? 'debug' : 'info',
            files: [
              // glob matching uses https://github.com/micromatch/picomatch
              `${distJS}/main.js`,
              `${distDir}/index.html`,
              `${distAssets}/**/*`,
              `${distCSS}/**/*`
            ]
          }, () => {
            ;[
              [['frontend/**/*.html'], ['copy']],
              [['frontend/views/**/*.vue'], ['exec:puglint']],
              [['backend/**/*.js', 'shared/**/*.js'], ['exec:eslint', 'backend:relaunch', 'reload']],
              [['.Gruntfile.babel.js', 'Gruntfile.js'], ['exec:eslintgrunt']]
            ].forEach(([globs, tasks]) => {
              globs.forEach(g => {
                grunt.verbose.debug(chalk`{green browsersync:} watching: ${g}`)
                bs.watch(g, { ignoreInitial: true }, () => {
                  grunt.verbose.debug(chalk`{green browsersync:} queuing: ${tasks}`)
                  grunt.task.run(tasks.concat(['keepalive']))
                  killKeepAlive && killKeepAlive() // allow the task queue to move forward
                })
              })
            })
            grunt.verbose.debug(chalk`{green browsersync:} setup done!`)
          })
        ]
      }
    ]

    const watcher = rollup.watch(watchOpts)
    watcher.on('event', event => {
      switch (event.code) {
        case 'BUNDLE_START':
          grunt.log.writeln(chalk`{green rollup:} ${event.input}`)
          break
        case 'START':
          grunt.verbose.debug(this.nameArgs, event.code, event)
          break
        case 'END':
          grunt.verbose.debug(this.nameArgs, event.code, event)
          watchFlag || watcher.close() // stop watcher (only build once) if 'rollup:watch' isn't called
          done && done()
          // set done to undefined so that if we get an 'ERROR' event later
          // while in watch mode, it doesn't tell grunt that we're done twice
          done = undefined
          break
        case 'BUNDLE_END': {
          const output = event.output.map(o => path.relative(__dirname, o)).join(', ')
          const input = path.basename(event.input)
          grunt.verbose.debug(this.nameArgs, event.code)
          grunt.log.writeln(chalk`{green created} {bold ${output}} {green from} {bold ${input}} {green in} {bold ${(event.duration / 1000).toFixed(1)}s}`)
          break
        }
        case 'FATAL':
        case 'ERROR':
          grunt.log.error(this.nameArgs, event)
          watchFlag || watcher.close()
          done && done(false)
          done = undefined
          break
      }
    })
  })

  function resolveScssFromId (id: string): ?string {
    if (id.indexOf('@assets/') === 0) {
      return path.resolve('./frontend/assets', chompLeft(id, '@assets/'))
    }
    for (const incPath of sassOptions.includePaths) {
      const res = path.join(incPath, id)
      if (fs.existsSync(res)) return res
    }
  }

  const watchScss = async function (source: string, filename: string, recurse: boolean) {
    try {
      for (const [match, id1, id2] of source.matchAll(/(?<!\/\/.*)(?:import ['"](.+?\.scss)['"]|@import ['"](.+?)['"];)/g)) {
        // sometimes the @imports in .scss files will contain the extension, and sometimes they won't
        const resolvedPath = resolveScssFromId(id1 || `${chompRight(id2, '.scss')}.scss`)
        if (resolvedPath) {
          grunt.verbose.debug(chalk`addWatchFile {cyanBright ${match}} => {cyanBright ${resolvedPath}}`)
          this.addWatchFile(resolvedPath)
          if (recurse) {
            await watchScss.call(this, await readFileAsync(resolvedPath, 'utf8'), resolvedPath, recurse)
          }
        } else {
          grunt.log.error(chalk`couldn't resolve: {cyanBright ${match}} in {cyanBright ${filename}}`)
        }
      }
    } catch (e) {
      grunt.log.error(`watchScss for ${filename} (typeof source = ${typeof source}):`, e.message, source)
      throw e
    }
  }
  // We use 'transformProxy' to intercept calls to the plugin's transform function,
  // so that we can watch .scss files for changes and rebuild the bundle + refresh browser
  const transformProxy = function (opts: { plugin: Object, match: RegExp, recurse: boolean }) {
    return new Proxy(opts.plugin, {
      get: function (obj, prop) {
        if (prop !== 'transform') return obj[prop]
        return async function (source: string, filename: string) {
          if (opts.match.test(filename)) {
            grunt.verbose.debug(chalk`{bold TRANFORM:} ${filename}`)
            await watchScss.call(this, source, filename, opts.recurse)
          }
          return obj.transform.call(this, source, filename)
        }
      }
    })
  }
}

// Using this instead of rollup-plugin-flow due to
// https://github.com/leebyron/rollup-plugin-flow/issues/5
function flow (options = {}) {
  return {
    name: 'flow-remove-types',
    transform: (code) => ({
      code: flowRemoveTypes(code, options).toString(),
      map: options.pretty ? { mappings: '' } : null
    })
  }
}

// Using this instead of rollup-plugin-browsersync because it's so simple
function browsersync (bsOptions, doneCB) {
  return {
    name: 'browsersync',
    writeBundle (options) {
      if (!bs.active) {
        bs.init(bsOptions || { server: '.' }, doneCB)
      } else {
        bs.reload(options.file)
      }
    }
  }
}

function svgLoader (options) {
  // Based on "rollup-plugin-vue-inline-svg" but better:
  // - fix sourcemaps bug on original plugin
  // - remove useless attrs and add global CSS class.
  const isSvg = createFilter('**/*.svg')
  return {
    name: 'vue-inline-svg',
    transform: (source, filePath) => {
      if (!isSvg(filePath)) return null
      const svgName = path.basename(filePath, '.svg')
      const svgClass = `svg-${svgName}`
      const svg = source
        // add global class automatically for theming customization
        .replace('<svg', `<svg class="${svgClass}"`)

      const compiled = compiler.compile(svg, { preserveWhitespace: false })
      const code = transpile(`module.exports = { render: function () { ${compiled.render} } };`)
        // convert to ES6 modules
        .replace('module.exports =', 'export default')

      return {
        code,
        map: { mappings: '' }
      }
    }
  }
}

/*
// ----------------------------------------
// TODO: convert this to a pure rollup plugin
// ----------------------------------------
var through = require('through2')
// This will replace <script> with <script2> in .html and .vue files
// EXCEPT:
// - within <!-- comments -->
// - top-level <script> tags within .vue files
// Additional exclusion per: http://www.rexegg.com/regex-best-trick.html
// Excluding <pre> tags did not seem to work, however.
function script2ify (file) {
  return !/\.(vue|html)$/.test(file) // edit to support other file types
    ? through()
    : through(function (buf, encoding, cb) {
      // avoid replacing top-level <script> tags in .vue files
      var regex = /\.vue$/.test(file)
        ? /<!--.*?-->|^<script>|^<\/script>|(?:<(\/)?script([ >]))/gm
        : /<!--.*?-->|(?:<(\/)?script([ >]))/gm
      var replacement = (m, p1, p2) => p2 ? `<${p1 || ''}script2${p2}` : m
      cb(null, buf.toString('utf8').replace(regex, replacement))
    })
}
*/
