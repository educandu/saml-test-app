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
import passportSaml from 'passport-saml';

const logger = acho();

const SamlStrategy = passportSaml.Strategy;

const env = cleanEnv(process.env, {
  TUNNEL_WEBSITE_DOMAIN: str()
});

const baseDir = url.fileURLToPath(new URL('../', import.meta.url).href);
const certDir = path.join(baseDir, './.tmp');
const sessionSecret = 'eb750d1ead0a413ea1984037afb90967';

const idpNames = glob.sync(`${baseDir}/idps/*/`).map(dir => path.basename(dir));
const idpName = idpNames[0];

const idPEntrypoint = fs.readFileSync(`${baseDir}/idps/${idpName}/entrypoint.txt`, 'utf8').trim();
const idPCertificate = fs.readFileSync(`${baseDir}/idps/${idpName}/certificate.txt`, 'utf8').trim();

const deAndEncryptionKeys = {
  private: fs.readFileSync(`${certDir}/encrypt-${env.TUNNEL_WEBSITE_DOMAIN}.key`, 'utf8'),
  public: fs.readFileSync(`${certDir}/encrypt-${env.TUNNEL_WEBSITE_DOMAIN}.pub`, 'utf8'),
  cert: fs.readFileSync(`${certDir}/encrypt-${env.TUNNEL_WEBSITE_DOMAIN}.cert`, 'utf8')
};

const samlStrategy = new SamlStrategy({
  callbackUrl: `https://${env.TUNNEL_WEBSITE_DOMAIN}/saml/login-callback`,
  entryPoint: idPEntrypoint,
  issuer: `https://${env.TUNNEL_WEBSITE_DOMAIN}`,
  cert: idPCertificate,
  decryptionPvk: deAndEncryptionKeys.private,
  forceAuthn: true
}, (profile, done) => done(null, { ...profile }));

passport.use(samlStrategy);

passport.serializeUser((user, done) => done(null, user));

passport.deserializeUser((user, done) => done(null, user));

const app = express();

app.use(cors());
app.use(session({ secret: sessionSecret, resave: false, saveUninitialized: false }));
app.use(passport.initialize());
app.use(passport.session());

app.get(
  '/saml/metadata',
  function (req, res) {
    const metadata = samlStrategy.generateServiceProviderMetadata(deAndEncryptionKeys.cert);
    res.set('content-type', 'text/xml').send(metadata);
  }
);

app.get(
  '/saml/login',
  function (req, res, next) {
    passport.authenticate('saml', err => {
      return err ? next(err) : res.end();
    })(req, res, next);
  }
);

app.post(
  '/saml/login-callback',
  express.urlencoded({ extended: false }),
  function (req, res, next) {
    passport.authenticate('saml', (err, user) => {
      if (err) {
        return next(err);
      }

      if (!user) {
        return res.redirect('/this-is-redirected-from-callback-without-user');
      }

      req.session.samlInfo = {
        provider: idpName,
        loggedInOn: new Date(),
        user
      };

      return res.redirect('/this-is-redirected-from-callback-with-success');
    })(req, res, next);
  }
);

app.get('*', (req, res) => {
  const body = JSON.stringify({
    originalUrl: req.originalUrl,
    user: req.user,
    session: req.session
  }, null, 2);

  const html = `
    <!DOCTYPE html>
    <pre>${body}</pre>
    <p><a href="/saml/login">LOGIN</a></p>
  `.trim();

  return res.set('content-type', 'text/html').send(html);
});

const server = app.listen(3000, () => {
  logger.info(`Server listening on https://localhost:3000 and https://${env.TUNNEL_WEBSITE_DOMAIN}`);
});

Graceful.on('exit', () => promisify(cb => server.close(cb)));
