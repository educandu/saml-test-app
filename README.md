# saml-test-app

Website for testing SAML authentication and authorization

## Steps to run locally

### Set necessary environment variables

~~~sh
export IDP_NAME=<your_idp_name> # default: samltest
export TUNNEL_TOKEN=<your_tunnel_token>
export TUNNEL_WEBSITE_DOMAIN=<your_tunnel_website_domain>
~~~

### Generate certificates

Run the task to generate the certificates in `./tmp/<cert_name>`

~~~sh
gulp certificate
~~~

### Generate metadata

Run the task to generate the metadata in `./tmp/generated-metadata.xml`

~~~sh
gulp metadata
~~~

### Register the app with an IdP

For the case of samltest:

Go to https://samltest.id/upload.php and upload the geneterated metadata file at `./.tmp/generated-metadata.xml`


### Run the app

~~~
gulp
~~~

## Create a new IdP configuration

Copy the certificate and entrypoint of your IdP in text files into:

* idps/<idp_name>/entrypoint.txt
* idps/<id_pname>/certificate.txt

...and start the app using the env variable `IDP_NAME` set to the folder name
