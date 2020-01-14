// bh.js
// ------------------------------------------------------------------
//
// wrapper for bullhorn API
//
// created: Sun Jan 12 18:01:40 2020
// last saved: <2020-January-14 15:07:54>

const endpoints = {
    "auth": "https://auth.bullhornstaffing.com/oauth/authorize",
    "token": "https://auth.bullhornstaffing.com/oauth/token",
    "apilogin": "https://rest.bullhornstaffing.com/rest-services/login"
};

const https       = require('https'),
      querystring = require('querystring'),
      tokenMgmt   = require('./tokenMgmt.js'),
      url         = require('url'),
      util        = require('util');

const batchSize   = 100;

function sleep (time, value) {
  return new Promise( resolve => {
    setTimeout(() => resolve(value), time);
  });
}

const httpsend = (verbose, requrl, method='get', headers, payload) => new Promise((resolve, reject) => {
  const parsed = url.parse(requrl);

  // not sure if needed
  if (payload) {
    headers['content-length'] = payload.length;
  }
  const options = {
    hostname: parsed.host,
    port: 443,
    path: parsed.path,
    method: method,
    headers
  };

  if (verbose) {
    console.log('%s %s', method.toUpperCase(), requrl);
  }
  
  let req = https.request(options, (response) => {
    let body = '';
    response.on('data', (chunk) => body += chunk);
    response.on('end', () => resolve({headers: response.headers, body}));
  }).on('error', reject);
  
  if (payload) { req.write(payload); }
  req.end();
});


function joinUrlElements() {
  let re1 = new RegExp('^\\/|\\/$','g'),
      elts = Array.prototype.slice.call(arguments);
  return elts.map(function(element){return element.replace(re1,""); }).join('/');
}


function boundHttpSend(reqUrl, method='get', headers, payload) {
  const session = this,
      targetUri = joinUrlElements(session.restUrl, reqUrl);
  headers = headers || {};
  headers.BhRestToken = session.BhRestToken;
  return httpsend(session.verbose, targetUri, method, headers, payload);
}


function boundGetAll(entityName, fields, batchCb) {
  const session = this;
  const baseQuery = {
    query: 'isDeleted:0',
    fields: (Array.isArray(fields)) ? fields.join(','): fields,   //: 'name,id,email,clientCorporation',
    count: batchSize
  };

  const getOneBatch = (start) => {
    const qparams = {...baseQuery, start:start };
    const query = querystring.stringify(qparams);
    return session.httpsend(`/search/${entityName}?${query}`, 'get')
      .then( ({ headers, body }) => {
        body = JSON.parse(body);
        batchCb(body);
        if (body.start + body.count < body.total) {
          return getOneBatch(start + batchSize);
        }
        return Promise.resolve(true);
      });
  };

  return getOneBatch(0);
}



function login(options) {
  // TODO: check token stash
  // if token present an unexpired, return a login promise
  // else return a chain with auth, token, then login promise

  // Calling /login with a non-expired access_token does not work. It
  // seems that we can do one login per access token!

  // But BhRestToken has a lifetime which is ... independent of the
  // lifetime of the access_token, but also supposedly 10 minutes.
  
  let currentToken = tokenMgmt.currentToken(options.username);
  if (currentToken) {
    let session = {...currentToken.meta.login, username: options.username, verbose:options.verbose };
    session.httpsend = boundHttpSend.bind(session);
    session.getAll = boundGetAll.bind(session);
    return Promise.resolve(session);
  }
  
  let p = null;
  let refreshableToken = tokenMgmt.currentToken(options.username, true);
    // .... refresh the token here.
    // https://auth.bullhornstaffing.com/oauth/token?grant_type=refresh_token&refresh_token={refresh_token}&client_id={client_id}&client_secret={client_secret}
    let tokenUrl = null;
    
    if (refreshableToken) {
      const queryparams = {
        client_id : options.client_id,
        client_secret : options.client_secret,
        refresh_token : refreshableToken.refresh_token,
        grant_type : 'refresh_token'
      };

      const query = querystring.stringify(queryparams);
      p = Promise.resolve(`${endpoints.token}?${query}`);
    }
    else {
      
      const queryparams = {
        client_id : options.client_id,
        username : options.username,
        password : options.password,
        action : 'Login',
        response_type : 'code'
      };

      const query = querystring.stringify(queryparams);
      const authUrl = `${endpoints.auth}?${query}`;
      p = httpsend(options.verbose, authUrl)
        .then( ({headers, body}) => {
          if (!headers.location) {
            return Promise.reject(new Error('response lacks location header'));
          }
          const callbackUrl = url.parse(headers.location, true);
          const callbackParams = callbackUrl.query;
          //console.log('code: ' + callbackParams.code);
          const queryparams = {
            grant_type : 'authorization_code',
            code : callbackParams.code,
            client_id : options.client_id,
            client_secret: options.client_secret
          };

          // https://auth.bullhornstaffing.com/oauth/token?
          // grant_type=authorization_code&
          // code={auth_code}&
          // client_id={client_id}&
          // client_secret={client_secret}&
          // redirect_uri={optional redirect_uri}
          const query = querystring.stringify(queryparams);
          return `${endpoints.token}?${query}`;
        });
    }

    p = p.then(tokenUrl => 
               httpsend(options.verbose, tokenUrl, 'post')
               .then( ({headers, body}) => {
                 if (options.verbose) {
                   console.log("headers: " + util.format(headers));
                   console.log("body: " + body);
                 }
                 if (!body) { return Promise.reject(new Error('missing body'));}
                 body = JSON.parse(body);
                 if (!body.access_token) { return Promise.reject(new Error('missing token'));}

                 tokenMgmt.stashToken(options.username, body); // stash the token
                 
                 // POST ?version=*&access_token={xxxxxxxx}
                 const query = querystring.stringify({ version:'*', access_token: body.access_token});
                 const loginUrl = `${endpoints.apilogin}?${query}`;
                 return httpsend(options.verbose,loginUrl, 'post');
               }));

  return p
    .then( ({headers, body}) => {
      if (options.verbose) {
        console.log("response headers: " + util.format(headers));
        console.log("response body: " + body);
      }
      if (!body) { return Promise.reject(new Error('missing body'));}
      body = JSON.parse(body);
      // stash BhRestToken with access_token
      tokenMgmt.appendRestTokenToStashedToken(options.username, body);
      
      let session = {...body, username: options.username, verbose:options.verbose };
      if (options.verbose) {
        console.log('session: ' + JSON.stringify(session));
      }
      session.httpsend = boundHttpSend.bind(session);
      session.getAll = boundGetAll.bind(session);
      return session;
    });
}

module.exports = {
  login
};
