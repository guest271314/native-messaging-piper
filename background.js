// Transferable Streams, MediaStream's, Insertable Streams,
// Byte Streams, Web Audio API, subprocess streams from Node.js, Deno, Bun
// to local rhasspy/piper with Native Messaging for real-time local text-to-speech
// streaming in Chrome browser

async function executeScript(...args) {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    try {
      if (!tab?.url.startsWith("chrome")) {
        const script = await chrome.scripting.executeScript({
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
// Inject script when chrome.runtime is installed and reloaded,
// when tabs are created and updated
chrome.runtime.onInstalled.addListener(executeScript);
chrome.tabs.onUpdated.addListener(executeScript);
chrome.tabs.onCreated.addListener(executeScript);
// Reload extension on action icon clicked
chrome.action.onClicked.addListener(() => {
  chrome.runtime.reload();
});
// Pass chrome-extension:ID/transferableStream.html as args
async function exec(args) {
  // Inject Piper class into all URL's, excluding chrome:, chrome-extension:
  // Process ReadableStream where underlying source is 1 channel s16 PCM
  // from rhasspy/piper as Array (JSON) in Web extension, written to
  // WritableStreamDefaultWriter as Uint8Array,
  // write data from stream to MediaStreamTrackGenerator,
  // output to speakers with Web Audio API.
  // Use class to expose AbortController
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
      // Count extra bytes used for silece to avoid clipping at start, end of stream.
      this.extraBytes = 0;
      // Web Audio API
      this.latencyHint = 0;
      this.frequency = 0;
      this.channelCount = 1;
      // Media Capture Transform MediaStreamTrackGenerator
      this.kind = "audio";
      // 1 channel s16 PCM, interleaved
      this.sampleRate = 22050;
      this.numberOfChannels = 1;
      // Frames per AudioData
      this.numberOfFrames = 220;
      // Byte length of Uint8Array per AudioData
      this.byteLength = 440;
      // WebCodecs AudioData format
      this.format = "s16";
      // ReadableStream byte stream
      this.type = "bytes";
      // AbortController to abort streams and audio playback
      this.abortable = new AbortController();
      this.signal = this.abortable.signal;
      // Readable byte stream
      this.bytestream = new ReadableStream({
        type: this.type,
        start: (c) => {
          // Byte stream controller
          return this.bytestreamController = c;
        },
      });
      // Readable byttestream reader
      this.reader = new ReadableStreamBYOBReader(this.bytestream);
      // Web Audio API BaseAudioContext
      this.ac = new AudioContext({
        latencyHint: this.latencyHint,
        sampleRate: this.sampleRate,
      });
      // Verify AudioContext state is closed on abort or complete
      this.ac.onstatechange = (e) =>
        console.log(`${e.target.constructor.name}.state ${e.target.state}`);
      // Use OscillatorNode to produce silence becuase MediaStreamTracxk of kind
      // audio does not produce silence per W3C Media Capture and Streams on Chrome
      // https://issues.chromium.org/issues/40799779.
      this.osc = new OscillatorNode(this.ac, {
        frequency: this.frequency,
        channelCount: this.channelCount,
      });
      // Should render silence per W3C Media Capture and Streams,
      // doesn't render silence on Chrome - without source input connected.
      this.msd = new MediaStreamAudioDestinationNode(this.ac, {
        channelCount: this.channelCount,
      });
      [this.track] = this.msd.stream.getAudioTracks();
      // Get timestamp from WebCodecs AudioData produced by silence stream
      // from OscillatorNode to MediaStreamAudioDestinationNode
      this.processor = new MediaStreamTrackProcessor({
        track: this.track,
      });
      // Write "s16" (S16_LE) PCM as Uint8Array to MediaStreamTrackGenerator writable
      this.generator = new MediaStreamTrackGenerator({
        kind: this.kind,
      });
      this.audioWriter = this.generator.writable.getWriter();
      this.mediaStream = new MediaStream([this.generator]);
      this.msn = new MediaStreamAudioSourceNode(this.ac, {
        mediaStream: this.mediaStream,
      });
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
      this.osc.connect(this.msd);
      this.msn.connect(this.ac.destination);
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
      return await Promise.allSettled([
        this.readable.pipeTo(
          new WritableStream({
            write: (u8) => {
              this.bytes += u8.length;
              this.bytestreamController.enqueue(u8);
            },
            close: () => {
              this.bytestreamController.close();
              // (this.generator.stats.toJSON().totalFrames/2)-this.extraBytes
              console.log("Input stream closed.");
            },
            // Verify abort reason propagates.
            abort: async (reason) => {
              console.log({
                reason,
              });
              this.bytestreamController.close();
              await this.audioWriter.close();
            },
          }),
          {
            signal: this.signal,
          },
        ).then(() => this.generator.stats.toJSON()),
        this.processor.readable.pipeTo(
          new WritableStream({
            start: async () => {
              // Avoid clipping of initial MediaStreamTrack playback, with
              // silence before playback begins.
              let silence = new AudioData({
                sampleRate: this.sampleRate,
                numberOfChannels: this.numberOfChannels,
                numberOfFrames: this.numberOfFrames * 2,
                format: this.format,
                timestamp: 0,
                data: new Uint8Array(this.byteLength * 2),
              });
              // console.log(silence.duration/10**6);
              await this.audioWriter.write(silence);
              // Count extra bytes used to insert silence at start, end of stream.
              this.extraBytes += this.byteLength * 2;
              console.log("Start output stream.");
            },
            write: async (audioData, c) => {
              // Get timestamp from AudioData stream of silence
              // from OscillatorNode connected to MedisStreamAudioDestinationNode
              // using MediaStreamTrackProcessor.
              // Manually incrementing timestamp with
              // basetime = 0; timestamp: basetime * 10**6;
              // basetime += audioData.duration ;
              // accounting for latency, asynchronous processes, to create
              // WebCodecs AudioData timestamp for live MediaStreamTrack non-trivial.
              const { timestamp } = audioData;
              let { value: data, done } = await this.reader.read(
                new Uint8Array(this.byteLength),
                {
                  min: this.byteLength,
                },
              );
              // Avoid clipping.
              // Fill last frames of AudioData with silence
              // when frames are less than 440
              if (data?.length < this.byteLength) {
                this.extraBytes += this.byteLength - data.length;
                const u8 = new Uint8Array(this.byteLength);
                u8.set(data, 0);
                data = u8;
              }
              // console.log(audioWriter.desiredSize, done);
              if (done) {
                // Stop MediaStreamTrack of MediaStreamAudioDestinationNode
                // and close MediaStreamTrackGenerator WritableStreamDefaultWriter.
                // Delay track.stop() for 100 milliseconds to avoid clipping
                // end of audio playback.
                if (this.signal.aborted) {
                  this.track.stop();
                  return c.error(this.signal.reason);
                }
                await this.audioWriter.close();
                return await scheduler.postTask(() => this.track.stop(), {
                  priority: "background",
                  delay: 100,
                });
              }
              if (this.signal.aborted) {
                return;
              }
              await this.audioWriter.ready;
              // Write Uint8Array representation of 1 channel S16 PCM
              await this.audioWriter.write(
                new AudioData({
                  sampleRate: this.sampleRate,
                  numberOfChannels: this.numberOfChannels,
                  // data.buffer.byteLength / 2,
                  numberOfFrames: this.numberOfFrames,
                  format: this.format,
                  timestamp,
                  data,
                }),
              ).catch((e) => {
                console.warn(e);
              });
            },
            close: () => {
              console.log("Output stream closed.");
              this.track.stop();
              // Remove Web extension injected HTML iframe.
              // Used for messaging data from piper with Native Messaging protocol
              // to TransformStream where the readable side is transferred to
              // the Web page and read
              this.removeFrame();
            },
            // Handle this.abortable.abort("reason");
            abort(reason) {
              console.log(reason);
            },
          }),
        ).then(() => ({
          bytes: this.bytes,
          extraBytes: this.extraBytes,
        })),
      ]).finally(() => Promise.all([this.ac.close(), this.removeFrame()]));
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
