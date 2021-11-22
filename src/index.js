import fs from 'fs';
import url from 'url';
import path from 'path';
import cors from 'cors';
import acho from 'acho';
import express from 'express';
import { promisify } from 'util'
import passport from 'passport';
import Graceful from 'node-graceful';
import session from 'express-session';
import { cleanEnv, str } from 'envalid';
import passportSaml from 'passport-saml';

const logger = acho();

const SamlStrategy = passportSaml.Strategy;

const env = cleanEnv(process.env, {
  TUNNEL_TOKEN: str(),
  TUNNEL_WEBSITE_DOMAIN: str()
});

const baseDir = url.fileURLToPath(new URL('../', import.meta.url).href);
const tmpDir = path.join(baseDir, './.tmp');
const sessionSecret = 'eb750d1ead0a413ea1984037afb90967';
const idpName = process.argv[2];

const idPEntrypoint = fs.readFileSync(`${baseDir}/idps/${idpName}/entrypoint.txt`, 'utf8').trim();
const idPCertificate = fs.readFileSync(`${baseDir}/idps/${idpName}/certificate.txt`, 'utf8').trim();

const deAndEncryptionKeys = {
  private: fs.readFileSync(`${tmpDir}/encrypt-${env.TUNNEL_WEBSITE_DOMAIN}.key`, 'utf8'),
  public: fs.readFileSync(`${tmpDir}/encrypt-${env.TUNNEL_WEBSITE_DOMAIN}.pub`, 'utf8'),
  cert: fs.readFileSync(`${tmpDir}/encrypt-${env.TUNNEL_WEBSITE_DOMAIN}.cert`, 'utf8')
};

const metadata = fs.readFileSync(`${tmpDir}/generated-metadata.xml`, 'utf8').trim();

const samlStrategy = new SamlStrategy({
  callbackUrl: `https://${env.TUNNEL_WEBSITE_DOMAIN}/saml/login/callback`,
  entryPoint: idPEntrypoint,
  issuer: `https://${env.TUNNEL_WEBSITE_DOMAIN}`,
  cert: idPCertificate,
  decryptionPvk: deAndEncryptionKeys.private
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
    res.send(metadata);
  }
);

app.post(
  '/saml/login/callback',
  express.urlencoded({ extended: false }),
  passport.authenticate('saml', { failureRedirect: '/error', failureFlash: true }),
  function (req, res) {
    res.redirect('/this-is-redirected-from-callback');
  }
);

app.get(
  '/saml/login',
  passport.authenticate('saml', { failureRedirect: '/error', failureFlash: true }),
  function (req, res) {
    res.redirect('/this-is-redirected-from-login');
  }
);

app.get('*', (req, res) => {
  const body = JSON.stringify({
    originalUrl: req.originalUrl,
    user: req.user,
    session: req.session
  }, null, 2);

  return res.set('Content-Type', 'text/html').send(`<!DOCTYPE html><pre>${body}</pre><p><a href="/saml/login">LOGIN</a></p>`);
});

const server = app.listen(3000, () => {
  logger.info(`Server listening on https://localhost:3000 and https://${env.TUNNEL_WEBSITE_DOMAIN}`);
});

Graceful.on('exit', () => promisify(cb => server.close(cb)));
