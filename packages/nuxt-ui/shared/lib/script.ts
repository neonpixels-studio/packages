import {
  accentStorageKey,
  resolveAppearanceConfig,
  themeStorageKey,
} from "./config.ts";
import {
  ACCENT_ATTRIBUTE,
  DARK_CLASS,
  DARK_QUERY,
  THEMES,
} from "./constants.ts";
import type { AppearanceConfigInput } from "./types.ts";

// A JSON value is safe inside a script element once the characters that could
// close it or break a line are escaped.
function toScriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

// Plain ES5 on purpose: it runs inline before any bundle, in any browser.
const SCRIPT_BODY = `
var root=document.documentElement;
function get(key){try{return localStorage.getItem(key)}catch(e){return null}}
function put(key,value){try{localStorage.setItem(key,value)}catch(e){}}
function drop(key){try{localStorage.removeItem(key)}catch(e){}}
function read(key,legacy,valid){
var value=get(key);
if(valid(value)){return value}
for(var index=0;index<legacy.length;index++){
var old=get(legacy[index]);
if(valid(old)){put(key,old);drop(legacy[index]);return old}
}
return null;
}
function systemDark(){try{return window.matchMedia(c.query).matches}catch(e){return false}}
var theme=read(c.themeKey,c.legacyTheme,function(v){return c.themes.indexOf(v)!==-1});
var dark=theme==="dark"||(theme!=="light"&&systemDark());
root.classList.toggle(c.darkClass,dark);
if(c.accents.length){
var accent=read(c.accentKey,c.legacyAccent,function(v){return typeof v==="string"&&c.accents.indexOf(v)!==-1});
root.setAttribute(c.accentAttribute,accent||c.defaultAccent);
}
`.replace(/\n/g, "");

// Every app value is written into the script as JSON, never joined in raw.
export function buildAppearanceScript(input: AppearanceConfigInput): string {
  const config = resolveAppearanceConfig(input);
  const values = {
    themeKey: themeStorageKey(config),
    accentKey: accentStorageKey(config),
    legacyTheme: config.legacyKeys.theme,
    legacyAccent: config.legacyKeys.accent,
    themes: THEMES,
    accents: config.accents,
    defaultAccent: config.defaultAccent,
    darkClass: DARK_CLASS,
    accentAttribute: ACCENT_ATTRIBUTE,
    query: DARK_QUERY,
  };
  return `(function(){var c=${toScriptJson(values)};${SCRIPT_BODY}})();`;
}
