'use strict'

// keep in sync with ChelActionParams
export type GIActionParams = {
  contractID: string;
  data: Object;
  options?: Object; // these are options for the action wrapper
  hooks?: Object;
  publishOptions?: Object
}
