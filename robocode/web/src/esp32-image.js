// Classic ESP32 application image format. Checked against Espressif esptool
// 5.3.1 elf2image (DIO, 80 MHz, 4 MB, ELF SHA256 at 0xb0).
// Format reference: https://docs.espressif.com/projects/esptool/en/latest/esp32/advanced-topics/firmware-image-format.html
const PAGE = 65536;
const MAX_APP = 0x140000;
const memory = (addr) => {
  if (addr >= 0x3f400000 && addr < 0x3f800000) return 'drom';
  if (addr >= 0x400d0000 && addr < 0x40400000) return 'irom';
  if (addr >= 0x3ff80000 && addr < 0x3ff82000) return 'rtc-dram';
  if (addr >= 0x3ffae000 && addr < 0x40000000) return 'dram';
  if (addr >= 0x40080000 && addr < 0x400a0000) return 'iram';
  if (addr >= 0x400c0000 && addr < 0x400c2000) return 'rtc-iram';
  if (addr >= 0x50000000 && addr < 0x50002000) return 'rtc';
  throw new Error('The firmware contains a memory region outside the classic ESP32 profile.');
};
const flash = (s) => ['drom', 'irom'].includes(memory(s.addr));
const concat = (a, b) => { const out = new Uint8Array(a.length + b.length); out.set(a); out.set(b, a.length); return out; };

export async function esp32ImageFromElf(input) {
  const elf = input instanceof Uint8Array ? input : new Uint8Array(input);
  const view = new DataView(elf.buffer, elf.byteOffset, elf.byteLength);
  const check = (offset, size) => {
    if (!Number.isSafeInteger(offset + size) || offset < 0 || size < 0 || offset + size > elf.length) throw new Error('Truncated ESP32 ELF file.');
  };
  check(0, 52);
  if (view.getUint32(0, false) !== 0x7f454c46 || elf[4] !== 1 || elf[5] !== 1 ||
      view.getUint16(16, true) !== 2 || view.getUint16(18, true) !== 94) {
    throw new Error('Expected a linked 32-bit Xtensa ESP32 ELF file.');
  }
  const start = view.getUint32(32, true), stride = view.getUint16(46, true), count = view.getUint16(48, true);
  if (stride !== 40 || !count) throw new Error('Invalid ESP32 ELF section table.');
  check(start, stride * count);
  const sections = [];
  for (let i = 0; i < count; i++) {
    const at = start + i * stride;
    const type = view.getUint32(at + 4, true), addr = view.getUint32(at + 12, true);
    const offset = view.getUint32(at + 16, true), length = view.getUint32(at + 20, true);
    if (!addr || !length || ![1, 14, 15].includes(type)) continue;
    check(offset, length);
    memory(addr); memory(addr + length - 1);
    const data = new Uint8Array(Math.ceil(length / 4) * 4);
    data.set(elf.subarray(offset, offset + length));
    const previous = sections.at(-1);
    if (previous && previous.addr + previous.data.length === addr && memory(previous.addr) === memory(addr)) {
      previous.data = concat(previous.data, data);
    } else sections.push({ addr, data });
  }
  if (!sections.length) throw new Error('ELF contains no ESP32 program sections.');
  const mapped = sections.filter(flash).sort((a, b) => a.addr - b.addr);
  const ram = sections.filter((s) => !flash(s)).sort((a, b) => a.addr - b.addr);
  for (let i = 1; i < mapped.length; i++) {
    if (Math.floor(mapped[i].addr / PAGE) === Math.floor(mapped[i - 1].addr / PAGE)) throw new Error('Overlapping flash mappings in ESP32 ELF.');
  }
  const output = new Uint8Array(MAX_APP);
  const out = new DataView(output.buffer);
  output.set([0xe9, 0, 2, 0x2f]); // DIO, 4 MB, 80 MHz.
  out.setUint32(4, view.getUint32(24, true), true);
  output[8] = 0xee;
  out.setUint16(17, 0xffff, true); // Maximum chip revision.
  output[23] = 1; // Append image SHA256.
  let pos = 24, checksum = 0xef, segmentCount = 0, patched = false;
  const elfHash = new Uint8Array(await crypto.subtle.digest('SHA-256', elf));
  const write = (segment, isFlash = false) => {
    let data = segment.data;
    const remainder = (pos + 8 + data.length) % PAGE;
    if (isFlash && remainder < 0x24) data = concat(data, new Uint8Array(0x24 - remainder));
    if (pos + 8 + data.length + 48 > MAX_APP || ++segmentCount > 16) throw new Error('Firmware is too large for the ESP32 application partition.');
    if (pos + 8 <= 0xb0 && 0xb0 + 32 <= pos + 8 + data.length) {
      const offset = 0xb0 - pos - 8;
      if (memory(segment.addr) !== 'drom' || data.slice(offset, offset + 32).some((b) => b !== 0)) throw new Error('Unexpected ESP32 application description.');
      data = data.slice(); data.set(elfHash, offset); patched = true;
    }
    out.setUint32(pos, segment.addr, true); out.setUint32(pos + 4, data.length, true);
    output.set(data, pos + 8);
    for (const byte of data) checksum ^= byte;
    pos += 8 + data.length;
  };
  while (mapped.length) {
    const segment = mapped[0];
    let padding = PAGE - pos % PAGE + segment.addr % PAGE - 8;
    if (padding === 0 || padding === PAGE) { write(mapped.shift(), true); continue; }
    padding -= 8;
    if (padding < 0) padding += PAGE;
    if (ram.length && padding > 8) {
      const first = ram[0], length = Math.min(padding, first.data.length);
      write({ addr: first.addr, data: first.data.slice(0, length) });
      first.addr += length; first.data = first.data.slice(length);
      if (!first.data.length) ram.shift();
    } else write({ addr: 0, data: new Uint8Array(padding) });
  }
  ram.forEach((segment) => write(segment));
  if (!patched) throw new Error('ESP32 application description was not found at the expected offset.');
  pos += 15 - pos % 16;
  output[pos++] = checksum;
  output[1] = segmentCount;
  output.set(new Uint8Array(await crypto.subtle.digest('SHA-256', output.subarray(0, pos))), pos);
  return output.slice(0, pos + 32);
}
