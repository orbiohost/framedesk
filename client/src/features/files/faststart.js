// Moves an MP4/MOV/M4A file's index ("moov") in front of its media data
// before upload, so the video starts playing at once when streamed from S3
// instead of the browser first fetching the end of the file.
//
// Nothing is decoded or re-encoded and the media data is never copied into
// memory: the result is a Blob stitched from slices of the original file plus
// the (small) rewritten index. The size stays exactly the same.
// Anything unusual (fragmented, compressed index, >4 GB offsets) is uploaded
// unchanged.

const FASTSTART_EXTENSIONS = new Set(['mp4', 'm4v', 'mov', 'm4a', '3gp']);
// Boxes that hold other boxes on the way down to the chunk offset tables.
const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl']);
// A moov bigger than this is unusual; reading it would use too much memory.
const MAX_MOOV_BYTES = 256 * 1024 * 1024;
const UINT32_MAX = 0xffffffff;

async function readHeader(file, offset) {
  const bytes = await file.slice(offset, offset + 16).arrayBuffer();
  return new DataView(bytes);
}

// Top-level boxes: [{ type, start, size }].
async function topLevelBoxes(file) {
  const boxes = [];
  let offset = 0;
  while (offset + 8 <= file.size) {
    const view = await readHeader(file, offset);
    let size = view.getUint32(0);
    const type = String.fromCharCode(
      view.getUint8(4),
      view.getUint8(5),
      view.getUint8(6),
      view.getUint8(7),
    );
    if (size === 1) {
      if (view.byteLength < 16) return null;
      size = Number(view.getBigUint64(8));
    } else if (size === 0) {
      size = file.size - offset;
    }
    if (size < 8 || offset + size > file.size) return null; // not a well-formed file
    boxes.push({ type, start: offset, size });
    offset += size;
  }
  return boxes;
}

function boxType(view, offset) {
  return String.fromCharCode(
    view.getUint8(offset + 4),
    view.getUint8(offset + 5),
    view.getUint8(offset + 6),
    view.getUint8(offset + 7),
  );
}

// Adds `shift` to every chunk offset in [from, to) of the file, editing the
// moov in place. Returns false when the file can't be fixed safely.
function shiftChunkOffsets(view, start, end, { shift, from, to }) {
  let offset = start;
  while (offset + 8 <= end) {
    let size = view.getUint32(offset);
    let header = 8;
    if (size === 1) {
      size = Number(view.getBigUint64(offset + 8));
      header = 16;
    } else if (size === 0) {
      size = end - offset;
    }
    if (size < header || offset + size > end) return false;
    const type = boxType(view, offset);
    if (type === 'cmov') return false; // compressed index
    if (CONTAINERS.has(type)) {
      if (!shiftChunkOffsets(view, offset + header, offset + size, { shift, from, to })) return false;
    } else if (type === 'stco' || type === 'co64') {
      const wide = type === 'co64';
      const count = view.getUint32(offset + header + 4);
      let entry = offset + header + 8;
      if (entry + count * (wide ? 8 : 4) > offset + size) return false;
      for (let i = 0; i < count; i += 1) {
        const current = wide ? Number(view.getBigUint64(entry)) : view.getUint32(entry);
        const moved = current >= from && current < to ? current + shift : current;
        if (wide) {
          view.setBigUint64(entry, BigInt(moved));
          entry += 8;
        } else {
          if (moved > UINT32_MAX) return false; // would need co64; leave the file alone
          view.setUint32(entry, moved);
          entry += 4;
        }
      }
    }
    offset += size;
  }
  return true;
}

export function canFaststart(fileName) {
  const extension = fileName.split('.').pop()?.toLowerCase();
  return FASTSTART_EXTENSIONS.has(extension);
}

/** Returns a File that streams well, or the original file when nothing needs (or can) change. */
export async function faststart(file) {
  if (!canFaststart(file.name)) return file;
  try {
    const boxes = await topLevelBoxes(file);
    if (!boxes || boxes.some((box) => box.type === 'moof')) return file;
    const moovIndex = boxes.findIndex((box) => box.type === 'moov');
    const mdatIndex = boxes.findIndex((box) => box.type === 'mdat');
    if (moovIndex < 0 || mdatIndex < 0 || moovIndex < mdatIndex) return file;
    const moov = boxes[moovIndex];
    if (moov.size > MAX_MOOV_BYTES) return file;

    const insertAt = boxes[mdatIndex].start;
    const moovBytes = await file.slice(moov.start, moov.start + moov.size).arrayBuffer();
    const view = new DataView(moovBytes);
    const header = view.getUint32(0) === 1 ? 16 : 8;
    // Everything from the first mdat up to the moov moves down by the moov's size.
    const moved = { shift: moov.size, from: insertAt, to: moov.start };
    if (!shiftChunkOffsets(view, header, moov.size, moved)) return file;

    const parts = [
      file.slice(0, insertAt),
      moovBytes,
      file.slice(insertAt, moov.start),
      file.slice(moov.start + moov.size),
    ];
    return new File(parts, file.name, { type: file.type, lastModified: file.lastModified });
  } catch {
    return file;
  }
}
