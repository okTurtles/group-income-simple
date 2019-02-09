import { setupPrimus } from './backend/pubsub.js'
import resolve from 'rollup-plugin-node-resolve'
import commonjs from 'rollup-plugin-commonjs'
import alias from 'rollup-plugin-alias'
import babel from 'rollup-plugin-babel'
import VuePlugin from 'rollup-plugin-vue'
import flow from 'rollup-plugin-flow'
import json from 'rollup-plugin-json'
import globals from 'rollup-plugin-node-globals'
import { eslint } from 'rollup-plugin-eslint'
import css from 'rollup-plugin-css-only'
import scssVariable from 'rollup-plugin-sass-variables'
// import collectSass from 'rollup-plugin-collect-sass'
// import sass from 'rollup-plugin-sass'
// import scss from 'rollup-plugin-scss'
// import browserifyPlugin from 'rollup-plugin-browserify-transform'
// https://github.com/4lejandrito/rollup-plugin-browsersync

// import rollup from 'rollup'
const rollup = require('rollup')
const chalk = require('chalk')
const fs = require('fs')
const path = require('path')
const url = require('url')

const development = process.env.NODE_ENV === 'development'
const livereload = development && (parseInt(process.env.PORT_SHIFT || 0) + 35729)

setupPrimus(require('http').createServer(), true)

const distDir = 'dist'
const distAssets = `${distDir}/assets`
const distJS = `${distAssets}/js`
const distCSS = `${distAssets}/css`

module.exports = (grunt) => {
  require('load-grunt-tasks')(grunt)

  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),

    checkDependencies: { this: { options: { install: true } } },

    watch: {
      // prevent watch from spawning. if we don't do this, we won't be able
      // to kill the child when files change.
      options: { spawn: false },
      rollup: {
        options: { livereload },
        files: [`${distJS}/main.js`]
      },
      css: {
        options: { livereload },
        files: ['frontend/assets/sass/**/*.{sass,scss}'],
        tasks: ['sass']
      },
      html: {
        options: { livereload },
        files: ['frontend/**/*.html'],
        tasks: ['copy']
      },
      backend: {
        files: ['backend/**/*.js', 'shared/**/*.js'],
        tasks: ['exec:eslint', 'backend:relaunch']
      },
      gruntfile: {
        files: ['.Gruntfile.babel.js', 'Gruntfile.js'],
        tasks: ['exec:eslintgrunt']
      }
    },

    sass: {
      options: {
        implementation: require('node-sass'),
        sourceMap: development,
        // https://github.com/vuejs/vueify/issues/34#issuecomment-161722961
        // indentedSyntax: true,
        // sourceMapRoot: '/',
        outputStyle: development ? 'nested' : 'compressed',
        includePaths: [
          './node_modules/bulma',
          './node_modules/@fortawesome/fontawesome-free/scss'
        ]
      },
      dev: {
        files: [{
          expand: true,
          cwd: 'frontend/assets/sass',
          src: ['*.{sass,scss}', '!_*/**'],
          dest: distCSS,
          ext: '.css'
        }]
      }
    },

    copy: {
      node_modules: {
        cwd: 'node_modules',
        src: ['systemjs/dist/*.{js,map}'],
        dest: distJS,
        expand: true,
        flatten: true
      },
      html_files: {
        src: 'frontend/index.html',
        dest: `${distDir}/index.html`
      },
      assets: {
        cwd: 'frontend/assets',
        src: ['**/*', '!sass/**'],
        dest: distAssets,
        expand: true
      },
      fontawesome: {
        cwd: 'node_modules/@fortawesome/fontawesome-free/webfonts/',
        src: ['fa-regular*', 'fa-solid*'],
        dest: `${distAssets}/fonts`,
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
        cmd: 'node node_modules/mocha/bin/mocha --require Gruntfile.js --exit -R spec --bail "{./{,!(node_modules)/**/}*.test.js,./test/*.js}"',
        options: { env: { LOAD_NO_FILE: 'true', ...process.env } }
      },

      // https://github.com/standard/standard/issues/750#issuecomment-379294276
      eslint: 'node ./node_modules/eslint/bin/eslint.js "**/*.{js,vue}"',
      eslintgrunt: "./node_modules/.bin/eslint --ignore-pattern '!.*.js' .Gruntfile.babel.js Gruntfile.js",
      stylelint: 'node ./node_modules/stylelint/bin/stylelint.js "frontend/**/*.{css,scss,vue}"',
      

      flow: './node_modules/.bin/flow'
    },

    clean: { dist: [`${distDir}/*`] },

    connect: {
      options: {
        port: process.env.FRONTEND_PORT,
        useAvailablePort: true,
        base: 'dist',
        livereload: livereload,
        middleware: (connect, opts, middlewares) => {
          middlewares.unshift((req, res, next) => {
            var f = url.parse(req.url).pathname // eslint-disable-line
            if (/^\/app(\/|$)/.test(f)) {
              // NOTE: if you change the URL from /app you must modify it here,
              //       and also:
              //       - page() function in `frontend/test.js`
              //       - base property in `frontend/simple/controller/router.js`
              console.log(`Req: ${req.url}, sending index.html for: ${f}`)
              res.end(fs.readFileSync(`${distDir}/index.html`))
            } else {
              next() // otherwise send the resource itself, whatever it is
            }
          })
          return middlewares
        }
      },
      dev: {}
    }
    // see also:
    // https://github.com/lud2k/grunt-serve
    // https://medium.com/@dan_abramov/the-death-of-react-hot-loader-765fa791d7c4
  })

  // -------------------------------------------------------------------------
  //  Grunt Tasks
  // -------------------------------------------------------------------------

  grunt.registerTask('default', ['dev'])
  grunt.registerTask('backend', ['backend:relaunch', 'watch'])
  grunt.registerTask('dev', ['checkDependencies', 'build:watch', 'connect', 'backend'])
  grunt.registerTask('dist', ['build'])
  grunt.registerTask('test', ['dist', 'connect', 'exec:test'])
  // TODO: add 'deploy' per:
  //       https://github.com/okTurtles/group-income-simple/issues/10

  grunt.registerTask('build', function () {
    const rollup = this.flags.watch ? 'rollup:watch' : 'rollup'
    // grunt.task.run(['exec:eslint', 'exec:stylelint', 'copy', 'sass', rollup])
    grunt.task.run(['exec:stylelint', 'copy', 'sass', rollup])
  })

  // -------------------------------------------------------------------------
  //  Code for running backend server at the same time as frontend server
  // -------------------------------------------------------------------------

  var fork = require('child_process').fork
  var child = null

  process.on('exit', () => { // 'beforeExit' doesn't work
    // In cases where 'watch' fails while child (server) is still running
    // we will exit and child will continue running in the background.
    // This can happen, for example, when running two GIS instances via
    // the PORT_SHIFT envar. If grunt-contrib-watch livereload process
    // cannot bind to the port for some reason, then the parent process
    // will exit leaving a dangling child server process.
    if (child) {
      grunt.log.writeln('Quitting dangling child!')
      child.send({})
    }
  })

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
        child = null
      })
      done()
    }
    if (child) {
      grunt.log.writeln('Killing child!')
      // wait for successful shutdown to avoid EADDRINUSE errors
      child.on('message', fork2)
      child.send({})
    } else {
      fork2()
    }
  })

  // -----------------------
  // - Our rollup command
  // -----------------------

  grunt.registerTask('rollup', function () {
    const done = this.async()
    const watchFlag = this.flags.watch
    const watchOpts = {
      clearScreen: false,
      input: 'frontend/main.js',
      output: {
        format: 'system',
        dir: distJS,
        // currently bad sourcemaps are being generated due to a bug in rollup or a plugin:
        // https://github.com/rollup/rollup/issues/2011#issuecomment-459929269
        sourcemap: development
      },
      external: ['crypto'],
      moduleContext: {
        'frontend/controller/utils/primus.js': 'window'
      },
      plugins: [
        alias({
          // https://vuejs.org/v2/guide/installation.html#Standalone-vs-Runtime-only-Build
          vue: path.resolve('./node_modules/vue/dist/vue.common.js')
        }),
        resolve({
          // we set `preferBuiltins` to prevent rollup from erroring with
          // [!] (commonjs plugin) TypeError: Cannot read property 'warn' of undefined
          // TypeError: Cannot read property 'warn' of undefined
          preferBuiltins: false
        }),
        json(),
        // TODO: probably don't need browserifyPlugin, just implement ourselves here as a raw object
        //       per: https://rollupjs.org/guide/en#plugins-overview
        // browserifyPlugin(script2ify, { include: '*.{vue,html}' }),
        scssVariable(),
        css({ output: `${distCSS}/component.css` }), // SUCCESS - spits out what's in .vue <style> tags
        // collectSass({ importOnce: true, extract: `${distCSS}/collectSass.css` }), // FAIL - flowtypes conflict
        // sass({ output: `${distCSS}/sass.css` }), // FAIL - flowtypes conflict
        // scss({ output: `${distCSS}/scss.css` }), // FAIL - produces empty bundle, probably only
        //                                              useful in the <script> section, i.e.
        //                                              <script>import 'foo.scss' ...
        eslint({ throwOnError: false, throwOnWarning: false }), // TODO: switch these to true
        VuePlugin({ css: false }), // TODO: switch to false and uncomment `css()`
        flow({ all: true }),
        commonjs({
          // include: 'node_modules/**'
          namedExports: {
            'node_modules/vuelidate/lib/validators/index.js': [ 'required', 'between', 'email', 'minLength', 'requiredIf' ],
            'node_modules/vue-circle-slider/dist/vue-circle-slider.common.js': [ 'CircleSlider' ]
          },
          ignore: ['crypto']
        }),
        babel({
          runtimeHelpers: true,
          exclude: 'node_modules/**' // only transpile our source code
        }),
        globals() // for Buffer support
      ]
    }
    const watcher = rollup.watch(watchOpts)
    watcher.on('event', event => {
      switch (event.code) {
        case 'START':
        case 'BUNDLE_START':
        case 'END':
          grunt.verbose.debug(this.nameArgs, event.code)
          break
        case 'BUNDLE_END':
          grunt.verbose.debug(this.nameArgs, event.code)
          const outputName = watchOpts.output.file || watchOpts.output.dir
          grunt.log.writeln(chalk`{green created} {bold ${outputName}} {green in} {bold ${(event.duration / 1000).toFixed(1)}s}`)
          watchFlag || watcher.close() // stop watcher (only build once) if 'rollup:watch' isn't called
          done()
          break
        case 'FATAL':
        case 'ERROR':
          grunt.log.error(this.nameArgs, event)
          watcher.close()
          done(false)
          break
      }
    })
  })
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
