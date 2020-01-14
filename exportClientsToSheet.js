// exportClientsToSheet.js
// ------------------------------------------------------------------
//
// Create a google sheet, and then iteratively download a batch of
// ClientContacts from Bullhorn, and append them to the sheet.
// 

const querystring = require('querystring'),
      util        = require('util'),
      bh          = require('./lib/bh.js'),
      fs          = require('fs'),
      sprintf     = require('sprintf-js').sprintf,
      path        = require('path'),
      moment      = require('moment'),
      {google}    = require('googleapis'),
      readline    = require('readline'),
      clipboardy  = require('clipboardy'),
      opn         = require('opn');
      
// ==================================================================
// I found that I needed the following nonsense in order to get
// ctrl-v (paste) events to work for readline() on Windows.
let rl = null;
function getReadline() {
  if (!rl) {
    readline.emitKeypressEvents(process.stdin);
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    process.stdin.setRawMode(true);
    process.stdin.on('keypress', (str, key) => {
      if (key.ctrl && key.name === 'v') {
        rl.write(clipboardy.readSync());
      }
    });
  }
  return rl; 
}
// ==================================================================


function sleep (time) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

function getNewGsuiteToken(oAuth2Client, tokenStashPath, projectId, callback) {
  console.log('\nYou must authorize Sheet updater to create a new sheet.\n');
  console.log('This script will now open a browser tab. After granting consent, you will');
  console.log('receive a one-time code. Return here and paste it in, to continue....\n');

  sleep(4200)
    .then(() => {
      const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: ['https://www.googleapis.com/auth/spreadsheets']
      });
      // Authorize this app by visiting the url
      opn(authUrl, {wait: false});
      getReadline().question('Paste the one-time-code: ', (code) => {
        oAuth2Client.getToken(code, (e, token) => {
          console.log(`Thanks! You have successfully authorized ${projectId} to do its thing.`);
          if (e) {
            console.log('cannot get token?');
            console.log(e);
            return callback(e);
          }
          oAuth2Client.setCredentials(token);
          // Store the token to disk for later program executions
          let dataToStore = JSON.stringify(token, null, 2) + '\n';
          fs.writeFile(tokenStashPath, dataToStore, (e) => {
            if (e) {
              console.error(e); // this is a non-fatal condition
            }
            else {
              console.log('stored token in token stash: ' + tokenStashPath);
            }
            callback(null, oAuth2Client);
          });
        });
      });
    });
}


/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function oauth2Authorize(credentials, callback) {
  const {client_secret, client_id, redirect_uris} = credentials;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  const tokenStashPath = path.join('.', ".gsheets_token_stash.json");
  // Check if there is a previously stashed token.
  //console.log('token stash path: ' + tokenStashPath);
  fs.readFile(tokenStashPath, (e, data) => {
    if (e) {
      console.log('cannot read stashed token: ' + e);
      return getNewGsuiteToken(oAuth2Client, tokenStashPath, credentials.project_id, callback);
    }
    let stashedToken = JSON.parse(data);
    
    //console.log('read stashed token: ' + util.format(stashedToken));
    //let expiry = new Date(stashedToken.expiry_date);
    //let now = new Date();
    //console.log('expires: ' + expiry.toISOString());
    //console.log('now: ' + now.toISOString());
    
    // expiry and refresh is handled automagically
    oAuth2Client.setCredentials(stashedToken); 
    callback(null, oAuth2Client);
  });
}


function createSheet(auth) {
  console.log('\nCreating a new spreadsheet on Google sheets...');
  const sheets = google.sheets({version: 'v4', auth});
  const today = moment(new Date()).format('YYYY-MMM-DD HH:mm:ss');
  const sheetTitle = 'Client Contacts';
  const request = {
    resource: { // could also use  "requestBody" here, apparently
      properties : {
        title: 'Client Contacts as of ' + today
      },
      sheets : [
        {
          properties: { sheetId : 0, title: sheetTitle }
        }
      ]
    }
  };
  
  return sheets.spreadsheets.create(request)
    .then(createResponse => {
      let currentRow = 0;
      const update = values => { 
        let range = sprintf("%s!R[%d]C[%d]:R[%d]C[%d]",
                            sheetTitle,
                            currentRow, 0,
                            currentRow + values.length, values[0].length);
        let options = {
          spreadsheetId: createResponse.data.spreadsheetId,
          valueInputOption: 'USER_ENTERED',
          range,
          resource: { values }
        };
        currentRow += values.length;
        return sheets.spreadsheets.values.append(options);
      };
      return {sheetId: createResponse.data.spreadsheetId, update};
    });
}


function doTheThing(projectId) {
  return function(e, oAuth2Client) {
    if (rl) { rl.close(); }
    if (e) {
      return console.log(e);
    }
    //console.log(`${projectId} is authorized to do its thing.`);
    const config    = require('./bh-config.json');
    const batchSize = 50;
    //config.verbose = true;

    createSheet(oAuth2Client)
      .then(({sheetId, update}) => {
        let updates = []; 
        const batchCb = batch => {
          let cells = batch.data.map( x => [ x.name, x.id, x.email || "--", x.clientCorporation.name ]);
          updates.push(update(cells).then( () => process.stdout.write('.') ));
        };
        
        bh.login(config)
          .then( session => session.getAll('ClientContact', 'name,id,email,clientCorporation', batchCb) )
          .then( () => Promise.all(updates))
          .then( () => {
            let url = `https://docs.google.com/spreadsheets/d/${sheetId}/edit#gid=0`;
            console.log(`\n${url}\n`);
            opn(url, {wait: false});
          })
        
          .catch( e => console.log(e) );
      })
  };
}


const clientCredentialsFile = path.join(".", "gsheets_client_credentials.json");
fs.readFile(clientCredentialsFile, (e, content) => {
  if (e) {
    console.log('Error loading client credentials file:', e);
    return;
  }
  let credentials = JSON.parse(content).installed;
  oauth2Authorize(credentials, doTheThing(credentials.project_id));
});


