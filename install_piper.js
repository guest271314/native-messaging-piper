import {
  chmodSync,
  existsSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import * as process from "node:process";

// node and deno don't behave the same. node doesn't support network imports
// by default, or --experimental-network-imports in v23.0.0-nightly20240915a65105ec28.
const untarFileStreamUrl =
  "https://gist.githubusercontent.com/guest271314/93a9d8055559ac8092b9bf8d541ccafc/raw/11589448b41116c3f45978810e6a284f5d565a63/UntarFileStream.js";
console.log(
  `Fetching ${
    untarFileStreamUrl.slice(
      untarFileStreamUrl.slice(untarFileStreamUrl.lastIndexOf("/") + 1),
    )
  } from ${untarFileStreamUrl}.`,
);
writeFileSync(
  "UntarFileStream.js",
  await (await fetch(
    untarFileStreamUrl,
  )).bytes(),
);

const { UntarFileStream } = await import("./UntarFileStream.js");

const { dirname, filename, url } = import.meta;

try {
  let file;
  const dir = "piper";
  const executables = new Set([`${dir}/${dir}`, `${dir}/${dir}_phonemize`]);
  const symlinks = new Map([
    [`libonnxruntime.so`, `libonnxruntime.so.1.14.1`],
    [`libespeak-ng.so.1`, `libespeak-ng.so.1.52.0.1`],
    [`libespeak-ng.so`, `libespeak-ng.so.1`],
    [`libpiper_phonemize.so.1`, `libpiper_phonemize.so.1.2.0`],
    [`libpiper_phonemize.so`, `libpiper_phonemize.so.1`],
  ]);

  const symlinkKeys = new Set(symlinks.keys());

  const encoder = new TextEncoder();

  function log(bytes, length) {
    // https://medium.com/deno-the-complete-reference/deno-nuggets-overwrite-a-console-log-line-2513e52e264b
    process.stdout.write(
      encoder.encode(`Fetching ${dir}. ${bytes} of ${length} bytes read.\r`),
    );
  }

  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
    console.log(`${dir} directory exists, overwriting.`);
  }
  // https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz
  const piperUrl =
    "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz";
  console.log(
    `Fetching ${
      piperUrl.slice(piperUrl.lastIndexOf("/") + 1)
    } from ${piperUrl}`,
  );
  const fileName = piperUrl.split("/").pop();
  const request = await fetch(
    new URL(piperUrl, url).href,
  );
  // bun does not support DecompressionStream
  const stream = request.body.pipeThrough(
    new TransformStream({
      start() {
        this.bytesWritten = 0;
        this.length = request.headers.get("content-length");
      },
      async transform(value, controller) {
        controller.enqueue(value);
        this.bytesWritten += value.length;
        log(this.bytesWritten, this.length);
      },
      flush() {
        console.log(
          `\nDone fetching ${fileName}. ${this.bytesWritten} bytes written.`,
        );
      },
    }),
  ).pipeThrough(new DecompressionStream("gzip"));
  const buffer = await new Response(stream).arrayBuffer();
  const untarFileStream = new UntarFileStream(buffer);
  while (untarFileStream.hasNext()) {
    file = untarFileStream.next();
    if (file.name.endsWith("/")) {
      mkdirSync(file.name.slice(0, -1));
      if (file.name === `${dir}/`) {
        console.log(`${file.name.slice(0, -1)} directory created.`);
      }
    } else {
      if (!symlinkKeys.has(file.name.slice(file.name.indexOf("/") + 1))) {
        writeFileSync(file.name, new Uint8Array(file.buffer));
      }
      if (executables.has(file.name)) {
        chmodSync(file.name, 0o764);
        console.log(`${file.name} written and set to executable.`);
      }
    }
  }
  process.chdir(dir);
  for (const [key, value] of symlinks) {
    symlinkSync(value, key);
    console.log(`${dir}/${key} symlink created pointing to ${value}`);
  }
  process.chdir(dirname);

  const voices = Array.of("en_US-hfc_female-medium", "en_US-hfc_male-medium");
  // https://raw.githubusercontent.com/guest271314/vits-web/refs/heads/patch-1/example/browser-standalone-bundle.js
  const HF_BASE =
    "https://huggingface.co/diffusionstudio/piper-voices/resolve/main";

  const PATH_MAP = {
    "ar_JO-kareem-low": "ar/ar_JO/kareem/low/ar_JO-kareem-low.onnx",
    "ar_JO-kareem-medium": "ar/ar_JO/kareem/medium/ar_JO-kareem-medium.onnx",
    "ca_ES-upc_ona-medium": "ca/ca_ES/upc_ona/medium/ca_ES-upc_ona-medium.onnx",
    "ca_ES-upc_ona-x_low": "ca/ca_ES/upc_ona/x_low/ca_ES-upc_ona-x_low.onnx",
    "ca_ES-upc_pau-x_low": "ca/ca_ES/upc_pau/x_low/ca_ES-upc_pau-x_low.onnx",
    "cs_CZ-jirka-low": "cs/cs_CZ/jirka/low/cs_CZ-jirka-low.onnx",
    "cs_CZ-jirka-medium": "cs/cs_CZ/jirka/medium/cs_CZ-jirka-medium.onnx",
    "da_DK-talesyntese-medium":
      "da/da_DK/talesyntese/medium/da_DK-talesyntese-medium.onnx",
    "de_DE-eva_k-x_low": "de/de_DE/eva_k/x_low/de_DE-eva_k-x_low.onnx",
    "de_DE-karlsson-low": "de/de_DE/karlsson/low/de_DE-karlsson-low.onnx",
    "de_DE-kerstin-low": "de/de_DE/kerstin/low/de_DE-kerstin-low.onnx",
    "de_DE-mls-medium": "de/de_DE/mls/medium/de_DE-mls-medium.onnx",
    "de_DE-pavoque-low": "de/de_DE/pavoque/low/de_DE-pavoque-low.onnx",
    "de_DE-ramona-low": "de/de_DE/ramona/low/de_DE-ramona-low.onnx",
    "de_DE-thorsten-high": "de/de_DE/thorsten/high/de_DE-thorsten-high.onnx",
    "de_DE-thorsten-low": "de/de_DE/thorsten/low/de_DE-thorsten-low.onnx",
    "de_DE-thorsten-medium":
      "de/de_DE/thorsten/medium/de_DE-thorsten-medium.onnx",
    "de_DE-thorsten_emotional-medium":
      "de/de_DE/thorsten_emotional/medium/de_DE-thorsten_emotional-medium.onnx",
    "el_GR-rapunzelina-low":
      "el/el_GR/rapunzelina/low/el_GR-rapunzelina-low.onnx",
    "en_GB-alan-low": "en/en_GB/alan/low/en_GB-alan-low.onnx",
    "en_GB-alan-medium": "en/en_GB/alan/medium/en_GB-alan-medium.onnx",
    "en_GB-alba-medium": "en/en_GB/alba/medium/en_GB-alba-medium.onnx",
    "en_GB-aru-medium": "en/en_GB/aru/medium/en_GB-aru-medium.onnx",
    "en_GB-cori-high": "en/en_GB/cori/high/en_GB-cori-high.onnx",
    "en_GB-cori-medium": "en/en_GB/cori/medium/en_GB-cori-medium.onnx",
    "en_GB-jenny_dioco-medium":
      "en/en_GB/jenny_dioco/medium/en_GB-jenny_dioco-medium.onnx",
    "en_GB-northern_english_male-medium":
      "en/en_GB/northern_english_male/medium/en_GB-northern_english_male-medium.onnx",
    "en_GB-semaine-medium": "en/en_GB/semaine/medium/en_GB-semaine-medium.onnx",
    "en_GB-southern_english_female-low":
      "en/en_GB/southern_english_female/low/en_GB-southern_english_female-low.onnx",
    "en_GB-vctk-medium": "en/en_GB/vctk/medium/en_GB-vctk-medium.onnx",
    "en_US-amy-low": "en/en_US/amy/low/en_US-amy-low.onnx",
    "en_US-amy-medium": "en/en_US/amy/medium/en_US-amy-medium.onnx",
    "en_US-arctic-medium": "en/en_US/arctic/medium/en_US-arctic-medium.onnx",
    "en_US-danny-low": "en/en_US/danny/low/en_US-danny-low.onnx",
    "en_US-hfc_female-medium":
      "en/en_US/hfc_female/medium/en_US-hfc_female-medium.onnx",
    "en_US-hfc_male-medium":
      "en/en_US/hfc_male/medium/en_US-hfc_male-medium.onnx",
    "en_US-joe-medium": "en/en_US/joe/medium/en_US-joe-medium.onnx",
    "en_US-kathleen-low": "en/en_US/kathleen/low/en_US-kathleen-low.onnx",
    "en_US-kristin-medium": "en/en_US/kristin/medium/en_US-kristin-medium.onnx",
    "en_US-kusal-medium": "en/en_US/kusal/medium/en_US-kusal-medium.onnx",
    "en_US-l2arctic-medium":
      "en/en_US/l2arctic/medium/en_US-l2arctic-medium.onnx",
    "en_US-lessac-high": "en/en_US/lessac/high/en_US-lessac-high.onnx",
    "en_US-lessac-low": "en/en_US/lessac/low/en_US-lessac-low.onnx",
    "en_US-lessac-medium": "en/en_US/lessac/medium/en_US-lessac-medium.onnx",
    "en_US-libritts-high": "en/en_US/libritts/high/en_US-libritts-high.onnx",
    "en_US-libritts_r-medium":
      "en/en_US/libritts_r/medium/en_US-libritts_r-medium.onnx",
    "en_US-ljspeech-high": "en/en_US/ljspeech/high/en_US-ljspeech-high.onnx",
    "en_US-ljspeech-medium":
      "en/en_US/ljspeech/medium/en_US-ljspeech-medium.onnx",
    "en_US-ryan-high": "en/en_US/ryan/high/en_US-ryan-high.onnx",
    "en_US-ryan-low": "en/en_US/ryan/low/en_US-ryan-low.onnx",
    "en_US-ryan-medium": "en/en_US/ryan/medium/en_US-ryan-medium.onnx",
    "es_ES-carlfm-x_low": "es/es_ES/carlfm/x_low/es_ES-carlfm-x_low.onnx",
    "es_ES-davefx-medium": "es/es_ES/davefx/medium/es_ES-davefx-medium.onnx",
    "es_ES-mls_10246-low": "es/es_ES/mls_10246/low/es_ES-mls_10246-low.onnx",
    "es_ES-mls_9972-low": "es/es_ES/mls_9972/low/es_ES-mls_9972-low.onnx",
    "es_ES-sharvard-medium":
      "es/es_ES/sharvard/medium/es_ES-sharvard-medium.onnx",
    "es_MX-ald-medium": "es/es_MX/ald/medium/es_MX-ald-medium.onnx",
    "es_MX-claude-high": "es/es_MX/claude/high/es_MX-claude-high.onnx",
    "fa_IR-amir-medium": "fa/fa_IR/amir/medium/fa_IR-amir-medium.onnx",
    "fa_IR-gyro-medium": "fa/fa_IR/gyro/medium/fa_IR-gyro-medium.onnx",
    "fi_FI-harri-low": "fi/fi_FI/harri/low/fi_FI-harri-low.onnx",
    "fi_FI-harri-medium": "fi/fi_FI/harri/medium/fi_FI-harri-medium.onnx",
    "fr_FR-gilles-low": "fr/fr_FR/gilles/low/fr_FR-gilles-low.onnx",
    "fr_FR-mls-medium": "fr/fr_FR/mls/medium/fr_FR-mls-medium.onnx",
    "fr_FR-mls_1840-low": "fr/fr_FR/mls_1840/low/fr_FR-mls_1840-low.onnx",
    "fr_FR-siwis-low": "fr/fr_FR/siwis/low/fr_FR-siwis-low.onnx",
    "fr_FR-siwis-medium": "fr/fr_FR/siwis/medium/fr_FR-siwis-medium.onnx",
    "fr_FR-tom-medium": "fr/fr_FR/tom/medium/fr_FR-tom-medium.onnx",
    "fr_FR-upmc-medium": "fr/fr_FR/upmc/medium/fr_FR-upmc-medium.onnx",
    "hu_HU-anna-medium": "hu/hu_HU/anna/medium/hu_HU-anna-medium.onnx",
    "hu_HU-berta-medium": "hu/hu_HU/berta/medium/hu_HU-berta-medium.onnx",
    "hu_HU-imre-medium": "hu/hu_HU/imre/medium/hu_HU-imre-medium.onnx",
    "is_IS-bui-medium": "is/is_IS/bui/medium/is_IS-bui-medium.onnx",
    "is_IS-salka-medium": "is/is_IS/salka/medium/is_IS-salka-medium.onnx",
    "is_IS-steinn-medium": "is/is_IS/steinn/medium/is_IS-steinn-medium.onnx",
    "is_IS-ugla-medium": "is/is_IS/ugla/medium/is_IS-ugla-medium.onnx",
    "it_IT-riccardo-x_low": "it/it_IT/riccardo/x_low/it_IT-riccardo-x_low.onnx",
    "ka_GE-natia-medium": "ka/ka_GE/natia/medium/ka_GE-natia-medium.onnx",
    "kk_KZ-iseke-x_low": "kk/kk_KZ/iseke/x_low/kk_KZ-iseke-x_low.onnx",
    "kk_KZ-issai-high": "kk/kk_KZ/issai/high/kk_KZ-issai-high.onnx",
    "kk_KZ-raya-x_low": "kk/kk_KZ/raya/x_low/kk_KZ-raya-x_low.onnx",
    "lb_LU-marylux-medium": "lb/lb_LU/marylux/medium/lb_LU-marylux-medium.onnx",
    "ne_NP-google-medium": "ne/ne_NP/google/medium/ne_NP-google-medium.onnx",
    "ne_NP-google-x_low": "ne/ne_NP/google/x_low/ne_NP-google-x_low.onnx",
    "nl_BE-nathalie-medium":
      "nl/nl_BE/nathalie/medium/nl_BE-nathalie-medium.onnx",
    "nl_BE-nathalie-x_low": "nl/nl_BE/nathalie/x_low/nl_BE-nathalie-x_low.onnx",
    "nl_BE-rdh-medium": "nl/nl_BE/rdh/medium/nl_BE-rdh-medium.onnx",
    "nl_BE-rdh-x_low": "nl/nl_BE/rdh/x_low/nl_BE-rdh-x_low.onnx",
    "nl_NL-mls-medium": "nl/nl_NL/mls/medium/nl_NL-mls-medium.onnx",
    "nl_NL-mls_5809-low": "nl/nl_NL/mls_5809/low/nl_NL-mls_5809-low.onnx",
    "nl_NL-mls_7432-low": "nl/nl_NL/mls_7432/low/nl_NL-mls_7432-low.onnx",
    "no_NO-talesyntese-medium":
      "no/no_NO/talesyntese/medium/no_NO-talesyntese-medium.onnx",
    "pl_PL-darkman-medium": "pl/pl_PL/darkman/medium/pl_PL-darkman-medium.onnx",
    "pl_PL-gosia-medium": "pl/pl_PL/gosia/medium/pl_PL-gosia-medium.onnx",
    "pl_PL-mc_speech-medium":
      "pl/pl_PL/mc_speech/medium/pl_PL-mc_speech-medium.onnx",
    "pl_PL-mls_6892-low": "pl/pl_PL/mls_6892/low/pl_PL-mls_6892-low.onnx",
    "pt_BR-edresson-low": "pt/pt_BR/edresson/low/pt_BR-edresson-low.onnx",
    "pt_BR-faber-medium": "pt/pt_BR/faber/medium/pt_BR-faber-medium.onnx",
    "pt_PT-tugão-medium": "pt/pt_PT/tugão/medium/pt_PT-tugão-medium.onnx",
    "ro_RO-mihai-medium": "ro/ro_RO/mihai/medium/ro_RO-mihai-medium.onnx",
    "ru_RU-denis-medium": "ru/ru_RU/denis/medium/ru_RU-denis-medium.onnx",
    "ru_RU-dmitri-medium": "ru/ru_RU/dmitri/medium/ru_RU-dmitri-medium.onnx",
    "ru_RU-irina-medium": "ru/ru_RU/irina/medium/ru_RU-irina-medium.onnx",
    "ru_RU-ruslan-medium": "ru/ru_RU/ruslan/medium/ru_RU-ruslan-medium.onnx",
    "sk_SK-lili-medium": "sk/sk_SK/lili/medium/sk_SK-lili-medium.onnx",
    "sl_SI-artur-medium": "sl/sl_SI/artur/medium/sl_SI-artur-medium.onnx",
    "sr_RS-serbski_institut-medium":
      "sr/sr_RS/serbski_institut/medium/sr_RS-serbski_institut-medium.onnx",
    "sv_SE-nst-medium": "sv/sv_SE/nst/medium/sv_SE-nst-medium.onnx",
    "sw_CD-lanfrica-medium":
      "sw/sw_CD/lanfrica/medium/sw_CD-lanfrica-medium.onnx",
    "tr_TR-dfki-medium": "tr/tr_TR/dfki/medium/tr_TR-dfki-medium.onnx",
    "tr_TR-fahrettin-medium":
      "tr/tr_TR/fahrettin/medium/tr_TR-fahrettin-medium.onnx",
    "tr_TR-fettah-medium": "tr/tr_TR/fettah/medium/tr_TR-fettah-medium.onnx",
    "uk_UA-lada-x_low": "uk/uk_UA/lada/x_low/uk_UA-lada-x_low.onnx",
    "uk_UA-ukrainian_tts-medium":
      "uk/uk_UA/ukrainian_tts/medium/uk_UA-ukrainian_tts-medium.onnx",
    "vi_VN-25hours_single-low":
      "vi/vi_VN/25hours_single/low/vi_VN-25hours_single-low.onnx",
    "vi_VN-vais1000-medium":
      "vi/vi_VN/vais1000/medium/vi_VN-vais1000-medium.onnx",
    "vi_VN-vivos-x_low": "vi/vi_VN/vivos/x_low/vi_VN-vivos-x_low.onnx",
    "zh_CN-huayan-medium": "zh/zh_CN/huayan/medium/zh_CN-huayan-medium.onnx",
    "zh_CN-huayan-x_low": "zh/zh_CN/huayan/x_low/zh_CN-huayan-x_low.onnx",
  };

  for (const voiceId of voices) {
    const path = PATH_MAP[voiceId];
    const voiceUrls = [`${HF_BASE}/${path}`, `${HF_BASE}/${path}.json`];
    for (const voiceUrl of voiceUrls) {
      try {
        console.log(`Fetching voice data ${voiceUrl}`);
        const response = await fetch(voiceUrl);
        const voiceData = await response.bytes();
        const voiceDataFileName = voiceUrl.slice(voiceUrl.lastIndexOf("/") + 1);
        writeFileSync(voiceDataFileName, voiceData);
        console.log(
          `Voice data ${voiceDataFileName} fetched and written to ${dirname}`,
        );
      } catch (e) {
        throw e;
      }
    }
  }
} catch (e) {
  console.log(e, navigator.userAgent);
  if (/Bun|Node/.test(navigator.userAgent)) {
    process.exit(1);
  } else {
    Deno.exit(1);
  }
}
