function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function isSelected(item) {
  if (!item) return false;
  return item.selected === true || item.selected === 1 || item.selected === '1' || item.selected === 'true';
}

function selectMediaPart(metadata) {
  if (!metadata) return { media: null, part: null };

  const mediaItems = asArray(metadata.Media);
  const media = mediaItems.find(isSelected) || mediaItems[0] || null;
  const parts = media ? asArray(media.Part) : [];
  const part = parts.find(isSelected) || parts[0] || null;

  return { media, part };
}

function getAllParts(metadata) {
  if (!metadata) return [];
  return asArray(metadata.Media).flatMap(media => asArray(media && media.Part));
}

function samePart(left, right) {
  if (!left || !right) return false;

  const identityFields = ['id', 'key', 'file'];
  return identityFields.some(field => (
    left[field] !== undefined &&
    right[field] !== undefined &&
    String(left[field]) === String(right[field])
  ));
}

function findMatchingPart(metadata, targetPart) {
  const parts = getAllParts(metadata);
  if (parts.length === 0) return null;

  const exact = parts.find(part => samePart(part, targetPart));
  if (exact) return exact;

  // A single-part item is unambiguous even when Plex omits IDs in one response.
  return parts.length === 1 ? parts[0] : null;
}

function getAudioStreams(part) {
  return asArray(part && part.Stream).filter(stream => Number(stream && stream.streamType) === 2);
}

function describeAudioStream(stream) {
  if (!stream) return null;
  return {
    id: stream.id !== undefined ? String(stream.id) : null,
    index: stream.index !== undefined && stream.index !== null && stream.index !== '' && Number.isInteger(Number(stream.index))
      ? Number(stream.index)
      : null,
    codec: stream.codec || null,
    language: stream.language || null,
    languageCode: stream.languageCode || null,
    title: stream.title || stream.displayTitle || null,
    channels: Number.isFinite(Number(stream.channels)) ? Number(stream.channels) : null
  };
}

function resolveAudioMap(part, stream) {
  if (!part || !stream) return null;

  const hasAbsoluteIndex = stream.index !== undefined && stream.index !== null && stream.index !== '';
  const absoluteIndex = Number(stream.index);
  if (hasAbsoluteIndex && Number.isInteger(absoluteIndex) && absoluteIndex >= 0) {
    // Plex's Stream.index is the demuxer stream index and maps directly to FFmpeg.
    return `0:${absoluteIndex}`;
  }

  const audioStreams = getAudioStreams(part);
  const relativeIndex = audioStreams.indexOf(stream);
  return relativeIndex >= 0 ? `0:a:${relativeIndex}` : null;
}

function resolvePlexMediaSource(activeMetadata, payloadMetadata, itemMetadata) {
  const metadataCandidates = [activeMetadata, payloadMetadata, itemMetadata].filter(Boolean);
  const selections = metadataCandidates.map(metadata => ({
    metadata,
    ...selectMediaPart(metadata)
  }));

  const sourceSelection = selections.find(selection => selection.part && selection.part.key);
  if (!sourceSelection) return null;

  const sourcePart = sourceSelection.part;
  const candidateParts = [];
  for (const metadata of metadataCandidates) {
    const matched = findMatchingPart(metadata, sourcePart);
    if (matched && !candidateParts.includes(matched)) candidateParts.push(matched);
  }
  if (!candidateParts.includes(sourcePart)) candidateParts.push(sourcePart);

  let selectedPart = null;
  let selectedStream = null;

  // Prefer the explicit selection from the active Plex session, then webhook,
  // then library metadata. This reflects the track the player is actually using.
  for (const part of candidateParts) {
    const selected = getAudioStreams(part).find(isSelected);
    if (selected) {
      selectedPart = part;
      selectedStream = selected;
      break;
    }
  }

  // Some Plex responses omit selected=true. Fall back to the first audio stream.
  if (!selectedStream) {
    for (const part of candidateParts) {
      const firstAudio = getAudioStreams(part)[0];
      if (firstAudio) {
        selectedPart = part;
        selectedStream = firstAudio;
        break;
      }
    }
  }

  return {
    partKey: sourcePart.key,
    audioMap: resolveAudioMap(selectedPart, selectedStream),
    audioStream: describeAudioStream(selectedStream)
  };
}

module.exports = {
  resolvePlexMediaSource,
  _internal: {
    asArray,
    isSelected,
    selectMediaPart,
    findMatchingPart,
    getAudioStreams,
    resolveAudioMap
  }
};
