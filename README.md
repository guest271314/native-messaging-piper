### native-messaging-piper

### Synopsis

Web Speech API does not define the capability to capture the audio output
of `window.speechSyntehsis.speak()` to a `MediaStream` or `ArrayBuffer` 
([`MediaStream`, `ArrayBuffer`, `Blob` audio result from speak() for recording?](https://lists.w3.org/Archives/Public/public-speech-api/2017Jun/0000.html)), 
and is not integrated with Web Audio API ([web audio api connected to speech api #1764](https://github.com/WebAudio/web-audio-api/issues/1764)).

Use Transferable Streams ([Transferable Streams Explained](https://github.com/whatwg/streams/blob/main/transferable-streams-explainer.md), [Transferable objects](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects), [Feature: Streams API: transferable streams](https://chromestatus.com/feature/5298733486964736)), 
`MediaStream` ([Media Capture and Streams](https://www.w3.org/TR/mediacapture-streams/)), Insertable Streams ([MediaStreamTrack Insertable Media Processing using Streams](https://www.w3.org/TR/mediacapture-transform/), [Insertable streams for MediaStreamTrack](https://developer.chrome.com/docs/capabilities/web-apis/mediastreamtrack-insertable-media-processing)), byte streams,
[Web Audio API](https://www.w3.org/TR/webaudio/) ([BaseAudioContext](https://webaudio.github.io/web-audio-api/#BaseAudioContext), [`MediaStreamAudioDestinationNode`](https://webaudio.github.io/web-audio-api/#MediaStreamAudioDestinationNode), [`MediaStreamAudioSourceNode`](https://webaudio.github.io/web-audio-api/#MediaStreamAudioDestinationNode), [`OscillatorNode`](https://webaudio.github.io/web-audio-api/#OscillatorNode)), [Byte Streams](https://github.com/whatwg/streams/blob/main/byte-streams-explainer.md) ([Streams Standard - WhatWG](https://streams.spec.whatwg.org/), [Using readable byte streams](https://developer.mozilla.org/en-US/docs/Web/API/Streams_API/Using_readable_byte_streams)),
subprocess streams from Node.js ([Child process](https://nodejs.org/api/child_process.html#processchdirdirectory)), Deno ([Deno.Command](https://docs.deno.com/api/deno/~/Deno.Command)), or Bun ([Child processes](https://bun.sh/docs/api/spawn)) to execute `piper` ([rhasspy/piper](https://github.com/rhasspy/piper)) with 
`--output_raw` option to stream raw 1 channel S16 PCM to the browser with
Native Messaging ([Chrome Developers](https://developer.chrome.com/docs/extensions/mv3/nativeMessaging/)
, [MDN Web Docs](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging)
, [Microsoft Edge Developer documentation](https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/developer-guide/native-messaging)
, [Messaging between the app and JavaScript in a Safari web extension](https://developer.apple.com/documentation/safariservices/messaging-between-the-app-and-javascript-in-a-safari-web-extension)), write the data to a `MediaStreamTrackGenerator` for the
capability to play back share the stream to speakers or headphones, record,
and with peers over a WebRTC `RTCPeerConnection` or `RTCDataChannel` ([WebRTC: Real-Time Communication in Browsers](https://www.w3.org/TR/webrtc/)).

### Installation

Clone repository, then fetch `piper` `.tar.gz` release; extract contents with 
[`UntarFileStream.js`](https://gist.githubusercontent.com/guest271314/93a9d8055559ac8092b9bf8d541ccafc/raw/11589448b41116c3f45978810e6a284f5d565a63/UntarFileStream.js) 
then write to extracted contents of `piper` to repository folder; 
install Native Messaging host manifest ([Native manifests](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_manifests)) to Chromium or Chrome 
user data directory.

```
git clone https://github.com/guest271314/native-messaging-piper
cd native-messaging-piper
node install_piper.js # Or deno -A install_piper.js, bun does not support DecompressionStream
node_istall_host.js # Or deno -A install_host.js, bun run install_host.js
```

To programmatically install the Web extension launch Chrome with

```
chrome --load-extension=/absolute/path/to/native-messaging-piper
```

#### Manual installation

1. Navigate to `chrome://extensions`.
2. Toggle `Developer mode`.
3. Click `Load unpacked`.
4. Select `native-messaging-piper` folder.
5. Note the generated extension ID.
6. Open `nm_piper.json` in a text editor, set `"path"` to absolute path of `nm_piper.js` and `chrome-extension://<ID>/` using ID from 5 in `"allowed_origins"` array. 
7. Copy the `nm_piper.json` file to Chrome or Chromium configuration folder, e.g., Chromium on \*nix `~/.config/chromium/NativeMessagingHosts`; Chrome dev channel on \*nix `~/.config/google-chrome-unstable/NativeMessagingHosts` [User Data Directory - Default Location](https://chromium.googlesource.com/chromium/src.git/+/HEAD/docs/user_data_dir.md#Default-Location).
8. Modify shebang line to use `node`, `deno`, or `bun` to run `nm_piper.js`; and set the file permission to executable.
9. Reload the extension. 

### Usage 
The default voices fetched from [diffusionstudio/piper-voices](https://huggingface.co/diffusionstudio/piper-voices/tree/main)
in `install_piper.js`, where additional voices are listed, are `en_US-hfc_female-medium`, and `en_US-hfc_male-medium` 
corresponding to `"male"` and `"female"` passed to `Piper` constructor.
Addjust accordingly to change voices downloaded from Hugging Faces and available in `install_piper.js`
at 

```
const voices = Array.of("en_US-hfc_female-medium", "en_US-hfc_male-medium");
```

and in the template literal in `nm_piper` at

```
const voiceuri = new URL(`./en_US-hfc_${voice}-medium.onnx`, import.meta.url).pathname;
```

The Web extension injects the `Piper` `class` into all Web URL's that do not start with `chrome:`
or `chrome-extension:` protocols. 

In DevTools `console` or `Snippets` in `Sources` panel, or in other code executed 
in the Web page, create a `Piper` instance.

The double quotes in template literal are necessary; the Native Messaging protocol
uses JSON over IPC between the spawned host (`nm_piper.js`) and the browser.

```
var piper = new Piper({
  voice: "male",
  text: `"Now watch. ..., this how science works.
One researcher comes up with a result.
And that is not the truth. No, no.
A scientific emergent truth is not the
result of one experiment. What has to
happen is somebody else has to verify
it. Preferably a competitor. Preferably
someone who doesn't want you to be correct.

- Neil deGrasse Tyson, May 3, 2017 at 92nd Street Y"`.replace(/\n/g, " "),
});

piper.stream().then(console.log).catch(console.error);
```

```
var piper = new Piper({
  voice: "female",
  text: `"So we need people to have weird new
ideas. We need more ideas to break it
and make it better.

Use it. Break it. File bugs. Request features.

- Soledad Penadés, Real time front-end alchemy, or: capturing, playing,
  altering and encoding video and audio streams, without
  servers or plugins!"`.replace(/\n/g, " "),
});

piper.stream().then(console.log).catch(console.error);
```

The `Piper` instance exposes a `mediaStream` property that is a live `MediaStream`
of the 1 channel S16 PCM output by `piper`.

To abort the audio playback and stream that sends data to the arbitrary Web page 
using Trasnferable Stream

```
tts.abort(); // Default parameter to abort is "Stream aborted." 
```

Or explicitly set the reason 

```
tts.abort("Cancel");
```

### Examples

Example `rhasspy/piper` and `diffusion-syduios` TTS audio output files are located in this repository at `en_US-hfc_male-medium.wav` and `en_US-hfc_female-medium.wav`.

### License

Do What the Fuck You Want to Public License [WTFPLv2](http://www.wtfpl.net/about/)
