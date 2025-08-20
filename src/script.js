// ---- Utility: UTF-8 <-> bytes ----
const enc = new TextEncoder()
const dec = new TextDecoder()

// Base64 helpers that work with Uint8Array
function bytesToBase64(bytes) {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode.apply(null, chunk)
  }
  return btoa(binary)
}

function base64ToBytes(b64) {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

// ---- Emoji mapping (65 symbols for 64 Base64 chars + '=') ----
const b64chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/='

const emojiAlphabet = [
  '🧍',
  '🦄',
  '🙃',
  '🦜',
  '🦩',
  '🦥',
  '😀',
  '🦧',
  '🦈',
  '😊',
  '🦑',
  '🦿',
  '🦐',
  '😂',
  '🦀',
  '🦋',
  '😃',
  '🦓',
  '🦒',
  '🦏',
  '😁',
  '🦘',
  '🧀',
  '🦢',
  '🦲',
  '🦙',
  '😄',
  '🦝',
  '🦟',
  '😆',
  '🦠',
  '🧃',
  '🧏',
  '😅',
  '🦰',
  '🤣',
  '🦣',
  '🦤',
  '🙂',
  '🦪',
  '😉',
  '🦫',
  '🦬',
  '😌',
  '🦯',
  '🦱',
  '🦳',
  '😍',
  '🦴',
  '🦵',
  '🦶',
  '🦷',
  '🦸',
  '🦹',
  '🦺',
  '🦻',
  '🦽',
  '🦾',
  '🧁',
  '🧊',
  '🧋',
  '🦮',
  '🧎',
  '🧑',
  '💩',
]

if (emojiAlphabet.length !== 65) {
  console.error('Emoji alphabet length must be 65; got', emojiAlphabet.length)
}

// Runtime check for unique emojis
const emojiSet = new Set(emojiAlphabet)
if (emojiSet.size !== emojiAlphabet.length) {
  throw new Error('Emoji alphabet contains duplicate emojis! All emojis must be unique.')
}

const charToEmoji = {}
const emojiToChar = {}
for (let i = 0; i < b64chars.length; i++) {
  const ch = b64chars[i]
  const em = emojiAlphabet[i]
  charToEmoji[ch] = em
  emojiToChar[em] = ch
}

function base64ToEmojiString(b64) {
  // Space-separated emojis for robust copy/paste
  const arr = []
  for (const ch of b64) {
    const em = charToEmoji[ch]
    if (!em) throw new Error('Invalid Base64 char in mapping: ' + ch)
    arr.push(em)
  }
  return arr.join(' ')
}

function emojiStringToBase64(soup) {
  const tokens = soup.trim().split(/\s+/).filter(Boolean)
  let out = ''
  for (const token of tokens) {
    const ch = emojiToChar[token]
    if (!ch)
      throw new Error('Unknown emoji token: "' + token + '". Ensure emojis are space-separated.')
    out += ch
  }
  return out
}

// ---- Crypto primitives ----
async function deriveKey(password, salt) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

async function encryptToEmojiSoup(message, password) {
  if (!message) throw new Error('Message is empty.')
  if (!password) throw new Error('Key/password is empty.')
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(password, salt)
  const ctBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(message))
  const ct = new Uint8Array(ctBuf)
  // Pack: [salt(16), iv(12), version(1), ciphertext(...)] => Base64 => Emojis
  const pack = new Uint8Array(salt.length + iv.length + 1 + ct.length)
  pack.set(salt, 0)
  pack.set(iv, salt.length)
  pack[salt.length + iv.length] = 1 // version byte after salt+iv
  pack.set(ct, salt.length + iv.length + 1)
  const b64 = bytesToBase64(pack)
  return base64ToEmojiString(b64)
}

async function decryptFromEmojiSoup(soup, password) {
  if (!soup) throw new Error('Emoji soup is empty.')
  if (!password) throw new Error('Key/password is empty.')
  const b64 = emojiStringToBase64(soup)
  const bytes = base64ToBytes(b64)
  const salt = bytes.slice(0, 16)
  const iv = bytes.slice(16, 28)
  const version = bytes[28]
  if (version !== 1) throw new Error('Unsupported version.')
  const ct = bytes.slice(29)
  const key = await deriveKey(password, salt)
  const ptBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct)
  return dec.decode(new Uint8Array(ptBuf))
}

// ---- UI wiring ----
const $ = (sel) => document.querySelector(sel)
const encMsg = $('#enc-msg')
const encKey = $('#enc-key')
const encOut = $('#enc-out')
const decSoup = $('#dec-soup')
const decKey = $('#dec-key')
const decOut = $('#dec-out')

$('#btn-encrypt').addEventListener('click', async () => {
  try {
    encOut.textContent = 'Encrypting…'
    const soup = await encryptToEmojiSoup(encMsg.value, encKey.value)
    encOut.textContent = soup
  } catch (e) {
    encOut.innerHTML = `<span class="error">${e.message || e}</span>`
    console.error(e)
  }
})

$('#btn-decrypt').addEventListener('click', async () => {
  try {
    decOut.textContent = 'Decrypting…'
    const text = await decryptFromEmojiSoup(decSoup.value, decKey.value)
    decOut.textContent = text
  } catch (e) {
    decOut.innerHTML = `<span class="error">${
      e.message || 'Decryption failed (wrong key or corrupted soup).'
    }</span>`
    console.error(e)
  }
})

$('#copy-soup').addEventListener('click', async () => {
  const soup = encOut.textContent.trim()
  if (!soup) return alert('Nothing to copy yet.')
  await navigator.clipboard.writeText(soup)
  alert('Emoji soup copied!')
})

$('#share-soup').addEventListener('click', async () => {
  const soup = encOut.textContent.trim()
  if (!soup) return alert('Nothing to share yet.')
  const url = new URL(location.href)
  url.hash = '#soup=' + encodeURIComponent(soup)
  const text = 'I encrypted a message into emoji soup. Can you decrypt it?'
  try {
    if (navigator.share)
      await navigator.share({
        title: 'EmojiCrypt',
        text,
        url: url.toString(),
      })
    else throw new Error('no share')
  } catch {
    await navigator.clipboard.writeText(url.toString())
    alert('Link copied!')
  }
})

$('#link-soup').addEventListener('click', async () => {
  const soup = encOut.textContent.trim()
  if (!soup) return alert('Nothing to link yet.')
  const url = new URL(location.href)
  url.hash = '#soup=' + encodeURIComponent(soup)
  await navigator.clipboard.writeText(url.toString())
  alert('Link copied!')
})

// Import soup from URL hash if present
;(function importFromHash() {
  const h = location.hash.slice(1)
  if (!h) return
  const params = new URLSearchParams(h)
  const soup = params.get('soup')
  if (soup) {
    $('#dec-soup').value = decodeURIComponent(soup)
    // focus key to prompt decrypt
    $('#dec-key').focus()
  }
})()

// Small demo helper (optional): fill example
if (!encMsg.value) {
  encMsg.value = 'Meet me at 7PM. Bring 🍕.'
}
