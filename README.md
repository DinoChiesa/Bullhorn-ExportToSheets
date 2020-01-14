# Export Bullhorn data to Sheets

This is a nodejs app that exports Bullhorn data to Google sheets.
It relies on credentials for Bullhorn as well as for Google sheets.

## Setup

Follow these steps:

1. visit console.cloud.google.com. Create a project. Then...
   * IAM
   * Create Credentials
   * OAuth2 client id
   * Other
   * (name it)
   * Save
   * Edit
   * Download JSON
   * also enable the spreadsheets API on this project

   The downloaded credentials file ought to look like this:
   ```
   {
     "installed": {
       "client_id": "8675309-b9aa47c7aa3ed0bc03ac569c.apps.googleusercontent.com",
       "project_id": "my-project-name",
       "auth_uri": "https://accounts.google.com/o/oauth2/auth",
       "token_uri": "https://www.googleapis.com/oauth2/v3/token",
       "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
       "client_secret": "ABCDEFGHIBAADBEEF",
       "redirect_uris": [
         "urn:ietf:wg:oauth:2.0:oob",
         "http://localhost"
       ]
     }
   }
   ```

2. email Bullhorn support and get a clientid and secret for REST.



## Config files

* gsheets_client_credentials.json - should contain the OAuth2 client credentials downloaded from Google cloud console.
* bh-config.json - should contain config for the bullhorn client
  Example:
  ```
  {
     "client_id" : "29891ad-2093-skj93299-2292",
     "client_secret":  "dksj93kf000202077",
     "username":  "myuser",
     "password":  "mypa$$word"
  }
  ```


## Examples

```
node .\exportClientsToSheet.js
```
