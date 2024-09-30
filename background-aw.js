// https://github.com/guest271314/native-messaging-piper
// Web Audio API AudioWorklet version
// SharedArrayBuffer, Web Audio API, subprocess streams from Node.js, Deno, Bun
// to local rhasspy/piper with Native Messaging for real-time local text-to-speech
// streaming in Chrome browser

// Inject script when chrome.runtime is installed and reloaded,
// when tabs are created and updated
chrome.runtime.onInstalled.addListener(executeScript);
chrome.tabs.onUpdated.addListener(executeScript);
chrome.tabs.onCreated.addListener(executeScript);
// Reload extension on action icon clicked
chrome.action.onClicked.addListener(() => {
  chrome.runtime.reload();
});
async function executeScript(/* ...args */) {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    try {
      if (!tab?.url.startsWith("chrome")) {
        await chrome.scripting.executeScript({
          target: {
            tabId: tab.id,
          },
          world: "MAIN",
          args: [chrome.runtime.getURL("transferableStream.html")],
          func: exec,
        });
      }
    } catch (e) {
      console.log(chrome.runtime.lastError, e);
      continue;
    }
  }
}
// Pass chrome-extension:ID/transferableStream.html as args
function exec(args) {
  // Inject Piper class into all URL's, excluding chrome:, chrome-extension:
  // Process ReadableStream where underlying source is 1 channel s16 PCM
  // from rhasspy/piper as Array (JSON) in Web extension
  globalThis.Piper = class Piper {
    constructor({ text, voice } = {
      text: "Speech synthesis.",
      voice: "male",
    }) {
      // Encoded into Web extension iframe URL
      this.params = new URLSearchParams(Object.entries({ text, voice }));
      this.url = new URL(args);
      // Text parameter to piper as JSON
      this.text = text;
      // Voice. Implemented: "male" or "female" matching en_US-hfc_${voice}-medium.onnx
      this.voice = voice;
      // Verify bytes in arbitrary Web page is equal to bytes
      // written to WritableStreamDefaultWriter in extension injected iframe.
      this.bytes = 0;
      // Web Audio API
      this.latencyHint = 0;
      this.channelCount = 1;
      // Media Capture Transform MediaStreamTrackGenerator
      // 1 channel s16 PCM, interleaved
      this.sampleRate = 22050;
      // WebCodecs AudioData formats
      this.inputFormat = "s16";
      this.outputFormat = "f32";
      // AbortController to abort streams and audio playback
      this.abortable = new AbortController();
      this.signal = this.abortable.signal;
      // Web Audio API BaseAudioContext
      this.ac = new AudioContext({
        latencyHint: this.latencyHint,
        sampleRate: this.sampleRate,
      });
      // Verify AudioContext state is closed on abort or complete
      this.ac.onstatechange = (e) =>
        console.log(`${e.target.constructor.name}.state ${e.target.state}`);
      this.msd = new MediaStreamAudioDestinationNode(this.ac, {
        channelCount: this.channelCount,
      });
      [this.track] = this.msd.stream.getAudioTracks();
      this.mediaStream = new MediaStream([this.track]);
      this.msn = new MediaStreamAudioSourceNode(this.ac, {
        mediaStream: this.mediaStream,
      });
      this.osc = new OscillatorNode(this.ac, {
        frequency: 0,
        channelCount: this.channelCount,
      });
      this.msn.connect(this.ac.destination);
    }
    // Remove iframe when done streaming, stream aborted, or error, exception.
    removeFrame() {
      document.querySelectorAll(`[src*="${this.url.origin}"]`)
        .forEach((iframe) => {
          document.body.removeChild(iframe);
        });
      this.transferableWindow = null;
    }
    abort(reason = "Stream aborted.") {
      this.abortable.abort(reason);
    }
    async stream() {
      // Web extension "web_accessible_resources" to communicate with iframe
      // from and to arbitrary Web pages using Transferable Streams.
      const { resolve, reject, promise } = Promise.withResolvers();
      this.promise = promise;
      const handleMessage = (event) => {
        if (event.origin === this.url.origin) {
          // If event.data is ReadableStream pass ReadableStream
          // and function to remove iframe from Web page when stream completes
          if (event.data instanceof ReadableStream) {
            resolve(event.data);
          } else {
            console.trace();
            reject(event.data);
          }
        }
      };
      addEventListener("message", handleMessage, { once: true });
      this.transferableWindow = document.createElement("iframe");
      this.transferableWindow.style.display = "none";
      this.transferableWindow.name = location.href;
      // Encode text and voice in chrome-extension: URL
      this.transferableWindow.src =
        `${this.url.href}?${this.params.toString()}`;
      document.body.appendChild(this.transferableWindow);
      this.readable = await this.promise;
      if ((!this.readable) instanceof ReadableStream) {
        return this.abort();
      }
      // Store byte from Uint8Array that is greater than an even length.
      let overflow = null;
      this.sab = new SharedArrayBuffer(0, {
        maxByteLength: (1024 ** 2) * 2,
      });
      this.view = new DataView(this.sab);
      // Convert 1 channel, S16_LE PCM as Uint8Array
      // to Float32Array, write to SharedArrayBuffer.
      const stream = this.readable.pipeTo(
        new WritableStream({
          write: (u8) => {
            this.bytes += u8.length;
            if (overflow) {
              u8 = new Uint8Array([overflow, ...u8]);
              overflow = null;
            }
            if (u8.length % 2 !== 0) {
              [overflow] = u8.subarray(-1);
              u8 = u8.subarray(0, u8.length - 1);
              overflow = null;
            }
            const ad = new AudioData({
              sampleRate: 22050,
              numberOfChannels: 1,
              numberOfFrames: u8.length / 2,
              timestamp: 0,
              format: this.inputFormat,
              data: u8,
            });
            const ab = new ArrayBuffer(ad.allocationSize({
              planeIndex: 0,
              format: this.outputFormat,
            }));
            ad.copyTo(ab, {
              planeIndex: 0,
              format: this.outputFormat,
            });
            const floats = new Float32Array(ab);
            for (let i = 0; i < floats.length; i++) {
              const offset = .75 * this.sab.byteLength;
              this.sab.grow(
                this.sab.byteLength + Float32Array.BYTES_PER_ELEMENT,
              );
              this.view.setFloat32(offset, floats[i]);
            }
          },
          close: () => {
            this.removeFrame();
            console.log("Input stream done.");
          },
          abort: async (reason) => {
            await this.ac.suspend();
            this.track.stop();
            this.aw.disconnect();
            this.msd.disconnect();
            this.msn.disconnect();
            console.log(reason);
          },
        }),
        { signal: this.signal },
      ).then(() => " piper TTS: End of stream.").catch((e) => e);
      // AudioWorklet
      class AudioWorkletProcessor {}
      class SharedMemoryAudioWorkletStream extends AudioWorkletProcessor {
        constructor(_options) {
          super();
          this.offset = 0;
          this.endOfStream = false;
          this.port.onmessage = (e) => {
            this.sab = e.data;
            this.view = new DataView(this.sab);
          };
        }
        process(_, [
          [output],
        ]) {
          if (
            this.sab.byteLength > 0 && this.offset >= this.sab.byteLength
          ) {
            if (!this.endOfStream) {
              this.endOfStream = true;
              this.port.postMessage({
                currentTime,
                currentFrame,
                byteLength: this.sab.byteLength,
                offset: this.offset,
              });
            }
            return true;
          }
          if (this.offset < this.sab.byteLength) {
            const floats = new Float32Array(128);
            loop: for (let i = 0; i < floats.length; i++, this.offset += 3) {
              if ((this.offset + 3) >= this.sab.byteLength) {
                do {
                  floats[i++] = this.view.getUint8(this.offset++);
                } while (this.offset < this.sab.byteLength);
                break loop;
              }
              floats[i] = this.view.getFloat32(this.offset);
            }
            output.set(floats);
            return true;
          }
          output.set(new Float32Array(128));
          return true;
        }
      }
      // Register processor in AudioWorkletGlobalScope.
      function registerProcessor(name, processorCtor) {
        return `console.log(globalThis);\n${processorCtor};\n
          registerProcessor('${name}', ${processorCtor.name});`
          .replace(/\s+/g, " ");
      }
      const worklet = URL.createObjectURL(
        new Blob([
          registerProcessor(
            "shared-memory-audio-worklet-stream",
            SharedMemoryAudioWorkletStream,
          ),
        ], { type: "text/javascript" }),
      );
      await this.ac.audioWorklet.addModule(
        worklet,
      );
      try {
        this.aw = new AudioWorkletNode(
          this.ac,
          "shared-memory-audio-worklet-stream",
          {
            numberOfInputs: 1,
            numberOfOutputs: 1,
            channelCount: 1,
          },
        );
      } catch (e) {
        console.log(e);
        if (this.signal.aborted) {
          throw this.signal.reason;
        }
        throw e;
      }
      // Post SharedArrayBuffer to AudioWorkeltProcessor scope.
      this.aw.port.postMessage(this.sab);
      this.aw.connect(this.msd);
      this.msn.connect(this.ac.destination);
      this.aw.onprocessorerror = (e) => {
        console.error(e, "processorerror");
        console.trace();
      };
      const { resolve: result, promise: endOfStream } = Promise.withResolvers();
      this.aw.port.onmessage = async (e) => {
        // Try avoiding pop at end of stream without another AudioNode.
        await scheduler.postTask(async () => {}, {
          delay: this.ac.playoutStats.maximumLatency,
          priority: "background",
        });
        await this.ac.suspend();
        this.track.stop();
        this.aw.disconnect();
        this.msd.disconnect();
        this.msn.disconnect();
        result({
          bytes: this.bytes,
          ...e.data,
          ...this.ac.playoutStats.toJSON(),
        });
      };
      return Promise.allSettled([stream, endOfStream]).finally(
        () => (this.removeFrame(), this.ac.close()),
      );
    }
  };
  return;
}

self.addEventListener("install", (event) => {
  console.log(event);
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  console.log(event);
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  console.log(event);
});
