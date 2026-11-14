// Helpers for the Android app (a Trusted Web Activity of https://desk.orbio.in).
//   node tools.cjs setup       accept the Android SDK licences, install SDK parts
//   node tools.cjs keystore    create the release signing key (once, then back it up)
//   node tools.cjs assetlinks  copy the built assetlinks.json into the web app
// The JDK 17 and Android SDK live in ~/.bubblewrap (see ~/.bubblewrap/config.json).
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const BW = path.join(os.homedir(), '.bubblewrap');
const JDK = path.join(BW, 'jdk');
const SDK = path.join(BW, 'android_sdk');
const WIN = process.platform === 'win32';
const env = { ...process.env, JAVA_HOME: JDK, ANDROID_HOME: SDK, ANDROID_SDK_ROOT: SDK };

function run(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', env, shell: WIN });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const say = (text) => process.stdout.write(`${text}\n`);
const sdkmanager = path.join(
  SDK,
  'cmdline-tools',
  'latest',
  'bin',
  WIN ? 'sdkmanager.bat' : 'sdkmanager',
);
const keytool = path.join(JDK, 'bin', WIN ? 'keytool.exe' : 'keytool');

const commands = {
  setup() {
    say('Read each Android SDK licence and answer "y" to accept it.');
    run(sdkmanager, [`--sdk_root=${SDK}`, '--licenses']);
    run(sdkmanager, [
      `--sdk_root=${SDK}`,
      'platform-tools',
      'build-tools;36.1.0',
      'platforms;android-36',
    ]);
    say('Android SDK ready.');
  },
  keystore() {
    if (fs.existsSync('android.keystore')) {
      say(
        'android.keystore already exists; not replacing it (that would lock you out of app updates).',
      );
      return;
    }
    say(
      'Choose a strong password and save it in a password manager. You need it for every release.',
    );
    run(keytool, [
      '-genkeypair',
      '-v',
      '-keystore',
      'android.keystore',
      '-alias',
      'framedesk',
      '-keyalg',
      'RSA',
      '-keysize',
      '2048',
      '-validity',
      '10000',
      '-dname',
      'CN=FrameDesk, O=Orbio, C=IN',
    ]);
    say('Created android.keystore. Back it up now (it is git-ignored).');
  },
  assetlinks() {
    const target = path.join('..', 'client', 'public', '.well-known', 'assetlinks.json');
    if (!fs.existsSync('assetlinks.json')) {
      say('No assetlinks.json yet: run `npm run build` first.');
      process.exit(1);
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync('assetlinks.json', target);
    say(
      `Copied to ${target}. Deploy the web app so https://desk.orbio.in/.well-known/assetlinks.json serves it.`,
    );
  },
};

const name = process.argv[2];
if (!commands[name]) {
  say(`Usage: node tools.cjs <${Object.keys(commands).join('|')}>`);
  process.exit(1);
}
commands[name]();
