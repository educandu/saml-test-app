import fs from 'fs';
import url from 'url';
import path from 'path';
import cors from 'cors';
import acho from 'acho';
import glob from 'glob';
import express from 'express';
import passport from 'passport';
import { promisify } from 'util';
import Graceful from 'node-graceful';
import session from 'express-session';
import { cleanEnv, str } from 'envalid';
import passportSamlNs from '@node-saml/passport-saml';

const logger = acho();

const { MultiSamlStrategy } = passportSamlNs;

const env = cleanEnv(process.env, {
  TUNNEL_WEBSITE_DOMAIN: str()
});

const baseDir = url.fileURLToPath(new URL('../', import.meta.url).href);
const certDir = path.join(baseDir, './.tmp');
const sessionSecret = 'eb750d1ead0a413ea1984037afb90967';

const idpKeys = glob.sync(`${baseDir}/idps/*/`).map(dir => path.basename(dir));
const identityProviders = idpKeys.map(key => ({
  key,
  entryPoint: fs.readFileSync(`${baseDir}/idps/${key}/entrypoint.txt`, 'utf8').trim(),
  cert: fs.readFileSync(`${baseDir}/idps/${key}/certificate.txt`, 'utf8').trim()
}));

const certsJson = fs.readFileSync(`${certDir}/${env.TUNNEL_WEBSITE_DOMAIN}.json`, 'utf8');
const deAndEncryptionKeys = JSON.parse(certsJson);

const idpKeySymbol = Symbol('idpKey');

const setIdpKeyForRequest = (req, idpName) => {
  return req[idpKeySymbol] = idpName;
};

const getIdpKeyForRequest = req => {
  return req[idpKeySymbol] || null;
};

const samlStrategy = new MultiSamlStrategy({
  getSamlOptions: (req, done) => {
    const providerKey = getIdpKeyForRequest(req);
    const provider = identityProviders.find(p => p.key === providerKey);
    return provider
      ? done(null, { entryPoint: provider.entryPoint, cert: provider.cert, callbackUrl: `https://${env.TUNNEL_WEBSITE_DOMAIN}/saml/login-callback/${provider.key}` })
      : done(new Error(`No identity provider with key '${providerKey}' is available`));
  },
  issuer: `https://${env.TUNNEL_WEBSITE_DOMAIN}`,
  decryptionPvk: deAndEncryptionKeys.private,
  wantAssertionsSigned: false,
  forceAuthn: true
}, (profile, done) => done(null, { ...profile }));

passport.use('saml', samlStrategy);

passport.serializeUser((user, done) => done(null, user));

passport.deserializeUser((user, done) => done(null, user));

const app = express();

app.use(cors());
app.use(session({ secret: sessionSecret, resave: false, saveUninitialized: false }));
app.use(passport.initialize());
app.use(passport.session());

app.get(
  '/saml/metadata/:idpKey',
  function (req, res, next) {
    setIdpKeyForRequest(req, req.params.idpKey);
    samlStrategy.generateServiceProviderMetadata(req, deAndEncryptionKeys.cert, null, (err, metadata) => {
      return err ? next(err) : res.set('content-type', 'text/xml').send(metadata);
    });
  }
);

app.get(
  '/saml/login/:idpKey',
  function (req, res, next) {
    setIdpKeyForRequest(req, req.params.idpKey);
    passport.authenticate('saml', err => {
      return err ? next(err) : res.end();
    })(req, res, next);
  }
);

app.post(
  '/saml/login-callback/:idpKey',
  express.urlencoded({ extended: false }),
  function (req, res, next) {
    setIdpKeyForRequest(req, req.params.idpKey);
    passport.authenticate('saml', (err, profile) => {
      if (err) {
        return next(err);
      }

      if (!profile) {
        return res.redirect('/this-is-redirected-from-callback-without-profile');
      }

      req.session.samlInfo = {
        providerKey: getIdpKeyForRequest(req),
        loggedInOn: new Date(),
        profile
      };

      return res.redirect('/this-is-redirected-from-callback-with-success');
    })(req, res, next);
  }
);

app.get('*', (req, res) => {
  const requestInfo = JSON.stringify({
    originalUrl: req.originalUrl,
    user: req.user,
    session: req.session
  }, null, 2);

  const html = `
    <!DOCTYPE html>
    <pre>${requestInfo}</pre>
    ${identityProviders.map(p => `<p><a href="/saml/login/${p.key}">Login with ${p.key}</a></p>`).join(' | ')}
  `.trim();

  return res.set('content-type', 'text/html').send(html);
});

const server = app.listen(3000, () => {
  logger.info(`Server listening on https://localhost:3000 and https://${env.TUNNEL_WEBSITE_DOMAIN}`);
});

Graceful.on('exit', () => promisify(cb => server.close(cb)));
