// getAllCorps.js
// ------------------------------------------------------------------
//

const querystring = require('querystring'),
      util        = require('util'),
      bh          = require('./bh.js');

const config      = require('./config.json');
const batchSize   = 10;

config.verbose = true;

bh.login(config)
  .then( session => {
    const baseQuery = {
      query: 'isDeleted:0',
      //fields: 'name,id',
      count: batchSize
    };

    const getOneBatch = (start) => {
      const qparams = {...baseQuery, start:start };
      const query = querystring.stringify(qparams);
      return session.httpsend(`/search/ClientCorporation?${query}`, 'get')
        .then( ({ headers, body }) => {
          body = JSON.parse(body);
          console.log(JSON.stringify(body,null,2));
          
          if (body.start + body.count < body.total) {
            return getOneBatch(start + batchSize);
          }
          return Promise.resolve(true);
        });
    };

    getOneBatch(0);
    
  })

  // .then( ({headers, body}) => {
  //   console.log("headers: " + util.format(headers));
  //   body = JSON.parse(body);
  //   console.log("body: " + JSON.stringify(body,null,2));
  // })

  .catch (e => console.log(e) );




