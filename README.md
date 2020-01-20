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
* bh-config.json - should contain config for the Bullhorn client
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

Export all Client Contacts from Bullhorn to a Google sheet.

```
node .\exportClientsToSheet.js
```

## About Bullhorn API Authentication

To call a Bullhorn API, the client app must pass a parameter called BhRestToken, either
as an HTTP header, or as a query param, or as a cookie (yes, really).

http://bullhorn.github.io/rest-api-docs/#session-key

To get a BhRestToken, the flow is:

  - call to get an access_token
  - call login with that access_token
  - get a BhRestToken
  - use that BhRestToken in subsequent API calls

In more detail:

- check the app-managed token cache. if there is a BhRestToken that is
  less than, say, 7 minutes old, then use it.

- else, get a new access_token, then use it to login to get a new
  BhRestToken. There are 2 subcases: 1. there is an access_token and
  refresh_token. 2. There is no existing access_token and refresh_token.

  - case 1: there is an existing access_token and refresh_token.

    Get a new access_token via the refresh_token grant

    You might think the client app would want to check the expiry of the
    access_token, and just re-use any existing one if it is not
    expired. That is not possible; the access_token is good for at most
    one call to /login.

    POST https://auth.bullhornstaffing.com/oauth/token
    Content-Type: application/x-www-form-urlencoded

    grant_type=refresh_token&
    refresh_token={refresh_token}&
    client_id={client_id}&
    client_secret={client_secret}


  - case 2: there is no refresh token.
    Get a new access_token. To do this,

    POST https://auth.bullhornstaffing.com/oauth/authorize
    Content-Type: application/x-www-form-urlencoded

    client_id={client_id}&
    username={username}&
    password={password}&
    action=Login&
    response_type=code

    The response will be a 302 redirect to http://bullhorn.com.  Do not
    follow the 302. Instead, from the Location header in the response,
    extract the "code" param from the query. Then redeem it for a token:

    POST https://auth.bullhornstaffing.com/oauth/token
    Content-Type: application/x-www-form-urlencoded

    grant_type=authorization_code&
    code={auth_code}&
    client_id={client_id}&
    client_secret={client_secret}

    The response to that is a JSON body with an access_token.


- call to login

  POST https://rest.bullhornstaffing.com/rest-services/login
  Content-Type: application/x-www-form-urlencoded

  version=*&access_token={access_token}

  result is a JSON body with:

  BhRestToken: "aaabbbbccd"
  ...

  This BhRestToken apparently lasts for 10 minutes.





