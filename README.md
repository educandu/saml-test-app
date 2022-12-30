# saml-test-app

Website for testing SAML authentication and authorization

## Steps to run locally

### Set necessary environment variables

~~~sh
export TUNNEL_TOKEN=<tunnel_token>
export TUNNEL_WEBSITE_DOMAIN=<tunnel_website_domain>
~~~

### Generate certificates

Run the task to generate the certificates in `./tmp/<cert_name>`

~~~sh
gulp certificate
~~~

### Run the app

~~~
gulp
~~~

### Register the app with an Identity Provider

For the case of samltest:

Go to https://samltest.id/upload.php and register using the metadata endpoint address `https://<tunnel_website_domain>/saml/metadata/<idp_name>`

## Add a new Identity Provider

Copy the certificate and entrypoint of your IdP in text files into:

* idps/<idp_name>/entrypoint.txt
* idps/<id_pname>/certificate.txt

---

## OER learning platform for music

Funded by 'Stiftung Innovation in der Hochschullehre'

<img src="https://stiftung-hochschullehre.de/wp-content/uploads/2020/07/logo_stiftung_hochschullehre_screenshot.jpg)" alt="Logo der Stiftung Innovation in der Hochschullehre" width="200"/>

A Project of the 'Hochschule für Musik und Theater München' (University for Music and Performing Arts)

<img src="https://upload.wikimedia.org/wikipedia/commons/d/d8/Logo_Hochschule_f%C3%BCr_Musik_und_Theater_M%C3%BCnchen_.png" alt="Logo der Hochschule für Musik und Theater München" width="200"/>

Project owner: Bernd Redmann\
Project management: Ulrich Kaiser
