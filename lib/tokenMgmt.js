// tokenMgmt.js
// ------------------------------------------------------------------
//
// functions for helping with management of user tokens.
//
// ------------------------------------------------------------------
// Copyright 2017-2018 Google LLC.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
/* global Buffer */

const path           = require('path'),
      fs             = require('fs'),
      os             = require('os'),
      tokenStashFile = path.join(os.homedir(), '.bullhorn-tokens');

const adjustmentInMilliseconds = 180 * 1000;

var stashedTokens;

function expiry(token) {
  // issued_at is in milliseconds; expires_in is in seconds. gah.
  return token.meta.issued_at + (token.expires_in * 1000);
}

function isExpired(token) {
  let now = (new Date()).getTime(),
      tokenExpiry = expiry(token),
      adjustedNow = now - adjustmentInMilliseconds;
  return (tokenExpiry < adjustedNow);
}

function isInvalidOrExpired(token) {
  if (!token || !token.expires_in || !token.access_token ){
    return true; // invalid
  }
  return isExpired(token);
}

function readTokenStash() {
  if (stashedTokens) {
    return stashedTokens;
  }
  if (fs.existsSync(tokenStashFile)) {
    stashedTokens = JSON.parse(fs.readFileSync(tokenStashFile, 'utf8'));
    return stashedTokens;
  }
  return null;
}

function getTokenStashKey(user) {
  return user;
}

function userToken(user) {
  const tokens = readTokenStash(),
        key = getTokenStashKey(user),
        userEntry = tokens && tokens[key];
  return userEntry;
}

function currentToken(user, expiredOk) {
  const userEntry = userToken(user);
  return (expiredOk || (userEntry && !isExpired(userEntry ))) ?
    userEntry : null;
}

function enhanceToken(token) {
  let meta = {};
  if (token.access_token) {
    // {
    //   "access_token" : "30:479cd0db-2c69-441a-8fca-4571002c677e",
    //   "token_type" : "Bearer",
    //   "expires_in" : 600,
    //   "refresh_token" : "30:d95408ed-9b87-4290-873b-4e242c7631bc"
    // }          
    let now = new Date();
    meta.issued_at = now.getTime(); // milliseconds
    meta.issued_at_iso = now.toISOString();

    let expiry = new Date(now.getTime() + token.expires_in * 1000);
    meta.expires = expiry.getTime();
    meta.expires_iso = expiry.toISOString();
  }
  token.meta = meta;
  return token;
}

function appendRestTokenToStashedToken(user, bhRestTokenPayload) {
  let tokens = readTokenStash();
  if ( ! tokens) { tokens = {}; }
  const key = getTokenStashKey(user);
  let token = tokens[key];
  if (!token || !token.meta) {
    return false;
  }
  token.meta.login = bhRestTokenPayload;
  
  fs.writeFileSync(tokenStashFile, JSON.stringify(tokens, null, 2));
  fs.chmodSync(tokenStashFile, '600');
  stashedTokens = tokens;
  return tokens;
}


function stashToken(user, tokenPayload) {
  
  let tokens = readTokenStash();
  if ( ! tokens) { tokens = {}; }
  const key = getTokenStashKey(user);
  tokens[key] = enhanceToken(tokenPayload);  // possibly overwrite an existing entry

  // tokens = Object.keys(tokens)                                  // map object to array of keys
  //   .filter( k => !isInvalidOrExpired(tokens[k]) )              // keep only unexpired tokens
  //   .reduce( (res, key) => (res[key] = tokens[key], res), {} ); // map back to object

  let keptTokens = {};
  Object.keys(tokens).forEach( key => {
    // Bullhorn refresh tokens never expire? So don't remove them.
    //if ( ! isInvalidOrExpired(tokens[key] )) {
      keptTokens[key] = tokens[key];
    //}
  });
  fs.writeFileSync(tokenStashFile, JSON.stringify(keptTokens, null, 2));
  fs.chmodSync(tokenStashFile, '600');
  stashedTokens = tokens;
  return tokens;
}

module.exports = {
  expiry,
  isInvalidOrExpired,
  currentToken,
  readTokenStash,
  stashToken,
  appendRestTokenToStashedToken
};
