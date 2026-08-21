// PRONUNCIATION CHEAT SHEET
// Quick reference for pronunciation features

// ═══════════════════════════════════════════════════════════
// USER FUNCTIONS (Use in Console or Scripts)
// ═══════════════════════════════════════════════════════════

// Reproduzir palavra
speakWord('serendipity');      // Pronounce the word
stopSpeaking();                // Stop pronunciation

// Gravar
startRecording('serendipity');  // Start recording (requests mic permission)
stopRecording('serendipity');   // Stop recording

// Reproduzir gravação
playPronunciationAudio('serendipity');   // Play saved recording
deletePronunciationAudio('serendipity'); // Delete saved recording
hasPronunciationAudio('serendipity');    // Check if recording exists

// ═══════════════════════════════════════════════════════════
// MANAGEMENT & DEBUGGING
// ═══════════════════════════════════════════════════════════

// Ver estatísticas
getPronunciationStorageStats()     // Returns { count, totalSize, totalSizeKB, avgSize, ... }
listPronunciationRecordings()      // Returns array of all saved recordings
clearAllPronunciationAudio()       // Delete ALL recordings (⚠️ careful!)
debugPronunciationStorage()        // Log detailed info to console

// ═══════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════

// Adjust pronunciation settings (before speaking)
PRONUNCIATION_CONFIG.synthRate = 0.8;    // Slower (0.5-2.0)
PRONUNCIATION_CONFIG.synthPitch = 1.2;   // Higher pitch (0.1-2.0)
PRONUNCIATION_CONFIG.synthVolume = 0.8;  // Quieter (0.0-1.0)

// Adjust audio quality for recordings
PRONUNCIATION_CONFIG.audioQuality.sampleRate = 8000;   // Lower = smaller files

// ═══════════════════════════════════════════════════════════
// EVENTS & STATES
// ═══════════════════════════════════════════════════════════

// The following classes are applied to buttons automatically:

// #btn-pronounce-word states:
// .speaking     - while pronunciation is playing
// .error        - when an error occurs

// #btn-record-word states:
// .recording    - while recording is active

// #btn-play-recording states:
// .playing      - while playback is active
// :disabled     - when no recording exists

// ═══════════════════════════════════════════════════════════
// STORAGE DETAILS
// ═══════════════════════════════════════════════════════════

// IndexedDB Store: pronunciations
// Key Format: pronunciation_${word.toLowerCase()}
// Example: pronunciation_serendipity

// Data Structure:
// {
//   key: "pronunciation_serendipity",
//   word: "serendipity",
//   audioBlob: Blob,
//   timestamp: 1692864000000,
//   size: 65536
// }

// Typical Sizes:
// 5 seconds  → 50-80 KB
// 10 seconds → 100-150 KB

// ═══════════════════════════════════════════════════════════
// TROUBLESHOOTING COMMANDS
// ═══════════════════════════════════════════════════════════

// Check browser support
console.log('SpeechSynthesis:', 'speechSynthesis' in window);
console.log('MediaRecorder:', 'MediaRecorder' in window);
console.log('IndexedDB:', 'indexedDB' in window);

// List all available voices
speechSynthesis.getVoices().forEach(v => console.log(v.name, v.lang));

// Test audio context
const ctx = new (window.AudioContext || window.webkitAudioContext)();
console.log('Sample Rate:', ctx.sampleRate);
console.log('State:', ctx.state);

// Clear ALL IndexedDB data (⚠️ dangerous!)
// indexedDB.deleteDatabase('lexiread-db');

// ═══════════════════════════════════════════════════════════
// CONSOLE RECIPES
// ═══════════════════════════════════════════════════════════

// Show storage space used
(async () => {
  const stats = await getPronunciationStorageStats();
  console.log(`Using ${stats.totalSizeKB} KB for ${stats.count} recordings`);
})();

// Export all recordings as metadata (without audio)
(async () => {
  const recordings = await listPronunciationRecordings();
  console.log(JSON.stringify(recordings, null, 2));
})();

// Find largest recording
(async () => {
  const all = await idbGetAll('pronunciations');
  const largest = all.reduce((a, b) => a.size > b.size ? a : b);
  console.log(`Largest: ${largest.word} (${(largest.size/1024).toFixed(2)}KB)`);
})();

// Delete recording older than 7 days
(async () => {
  const all = await idbGetAll('pronunciations');
  const now = Date.now();
  const week = 7 * 24 * 60 * 60 * 1000;
  for (const rec of all) {
    if (now - rec.timestamp > week) {
      await idbDelete('pronunciations', rec.key);
      console.log(`Deleted old: ${rec.word}`);
    }
  }
})();

// ═══════════════════════════════════════════════════════════
// VERSION INFO
// ═══════════════════════════════════════════════════════════

// pronunciation.js v1.0
// Added 2026-08-12
// Dependencies: storage.js, word-model.js
