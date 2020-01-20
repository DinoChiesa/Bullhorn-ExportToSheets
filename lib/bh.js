// bh.js
// ------------------------------------------------------------------
//
// wrapper for bullhorn API
//
// created: Sun Jan 12 18:01:40 2020
// last saved: <2020-January-20 15:53:26>

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

function isNumeric(n) {
  return !isNaN(parseFloat(n)) && isFinite(n);
}

const httpsend = (verbose, requrl, method='get', headers, payload) => new Promise((resolve, reject) => {
  const parsed = url.parse(requrl);
  headers = headers || {}
  
  // not sure if needed
  if (payload) {
    headers['content-length'] = payload.length;
    if (!headers['content-type']) {
      headers['content-type'] = 'application/x-www-form-urlencoded';
    }
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
    if (isNumeric(verbose) && Number(verbose) > 1) {
      console.log('HEADERS %s', JSON.stringify(headers));
      if (payload) {
        console.log('PAYLOAD %s', payload);
      }
    }
  }
  
  let req = https.request(options, (response) => {
    let body = '';
    response.on('data', (chunk) => body += chunk);
    response.on('end', () => resolve({response, body}));
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
      .then( ({ response, body }) => {
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
  // lifetime of the access_token, but also apparently 10 minutes.
  
  let currentToken = tokenMgmt.currentToken(options.username);
  if (currentToken) {
    let session = {...currentToken.meta.login, username: options.username, verbose:options.verbose };
    session.httpsend = boundHttpSend.bind(session);
    session.getAll = boundGetAll.bind(session);
    return Promise.resolve(session);
  }
  
  let p = null;
  let refreshableToken = tokenMgmt.currentToken(options.username, true);
  
  if (refreshableToken) {
    // refresh the token here.
    // POST https://auth.bullhornstaffing.com/oauth/token
    // grant_type=refresh_token&refresh_token={refresh_token}&client_id={client_id}&client_secret={client_secret}
    const formparams = {
      client_id : options.client_id,
      client_secret : options.client_secret,
      refresh_token : refreshableToken.refresh_token,
      grant_type : 'refresh_token'
    };

    p = Promise.resolve(querystring.stringify(formparams));
  }
  else {

    const formparams = {
      client_id : options.client_id,
      username : options.username,
      password : options.password,
      action : 'Login',
      response_type : 'code'
    };

    const payload = querystring.stringify(formparams);
    p = httpsend(options.verbose, endpoints.auth, 'POST', {}, payload)
      .then( ({response, body}) => {
        if (!response.headers.location) {
          return Promise.reject(new Error('response lacks location header'));
        }
        const callbackUrl = url.parse(response.headers.location, true);
        const callbackParams = callbackUrl.query;
        //console.log('code: ' + callbackParams.code);
        const formparams = {
          grant_type : 'authorization_code',
          code : callbackParams.code,
          client_id : options.client_id,
          client_secret: options.client_secret
        };

        // https://auth.bullhornstaffing.com/oauth/token
        // PAYLOAD: 
        // grant_type=authorization_code&
        // code={auth_code}&
        // client_id={client_id}&
        // client_secret={client_secret}&
        // redirect_uri={optional redirect_uri}
        return querystring.stringify(formparams);
      });
  }

  p = p.then(payload => 
             httpsend(options.verbose, endpoints.token, 'post', {}, payload)
             .then( ({response, body}) => {
               if (options.verbose) {
                 console.log("==> %s", response.statusCode);
                 console.log("response headers: " + util.format(response.headers));
                 console.log("response body: " + body);
               }
               if (!body) { return Promise.reject(new Error('missing body')); }
               body = JSON.parse(body);
               if (!body.access_token) { return Promise.reject(new Error('missing token')); }

               tokenMgmt.stashToken(options.username, body); // stash the token
               
               // POST version=*&access_token={xxxxxxxx}
               const payload = querystring.stringify({ version:'*', access_token: body.access_token});
               return httpsend(options.verbose, endpoints.apilogin, 'post', {}, payload);
             }));

  return p
    .then( ({response, body}) => {
      if (options.verbose) {
        console.log("response headers: " + util.format(response.headers));
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
