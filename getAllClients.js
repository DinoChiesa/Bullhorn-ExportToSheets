// getAllClients.js
// ------------------------------------------------------------------
//

const querystring = require('querystring'),
      util        = require('util'),
      bh          = require('./bh.js');

const config      = require('./config.json');

function oneBatch(batch) {
  console.log(JSON.stringify(batch,null,2));
}

bh.login(config)
  .then( session => 
         session.getAll('ClientContact', 'name,id,email,clientCorporation', oneBatch) )

  .catch (e => console.log(e) );




