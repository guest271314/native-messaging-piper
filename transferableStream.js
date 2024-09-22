try {
  // Verify bytes from Native Messaging host are equal to bytes
  // read in Web page.
  let bytes = 0;
  const { readable, writable } = new TransformStream({
    start(c) {
      console.log("Start input stream.");
    },
    transform(u8, controller) {
      controller.enqueue(u8);
    },
    flush() {
      console.log("Flush input stream.");
    },
  });
  const writer = writable.getWriter();
  writer.closed.then(() => {
    console.log("Input writer closed.");
  })
    // Catch AbortController.abort() from trasferred ReadableStream.
    .catch((e) => {
      console.log(e);
      port.disconnect();
      self.close();
    });
  // Transfer readable to Web page.
  parent.postMessage(readable, name, [readable]);
  // text and voice from Web page.
  const params = Object.fromEntries(new URL(location.href).searchParams);
  // Connect to Node.js, Deno, Bun Native Messaging host.
  // Execute rhasspy/piper with output_raw option, stream stdout
  // from piper to host, host to client Web extension, to Web page
  // with WHATWG Streams and postMessage().
  const port = chrome.runtime.connectNative(
    chrome.runtime.getManifest().short_name,
  );
  port.onMessage.addListener(async (message) => {
    bytes += message.length;
    // Write 1 channel s16 PCM to writable.
    await writer.write(new Uint8Array(message))
      .catch((e) => {
        console.trace();
        port.disconnect();
      });
  });
  port.onDisconnect.addListener(async () => {
    console.log(chrome.runtime.lastError, { bytes });
    await writer.close();
  });
  port.postMessage(params);
} catch (e) {
  parent.postMessage(e, name);
  self.close();
}
