export interface StickerDefinition {
  id: string;
  name: string;
  category: 'Animals' | 'Ribbons' | 'Love & Flowers' | 'Fruits' | 'Birthday' | 'Stars & Magic' | 'Vintage & Deco';
  svg: string;
}

export const STICKER_DEFINITIONS: StickerDefinition[] = [
  // 1. Animals
  {
    id: 'sticker-cat-white',
    name: 'Cute White Cat',
    category: 'Animals',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <path d="M22 42 L18 18 L42 28 Z" fill="#FCE4EC" stroke="#4A3E3D" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M78 42 L82 18 L58 28 Z" fill="#FCE4EC" stroke="#4A3E3D" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M26 36 L24 24 L36 30 Z" fill="#F48FB1"/>
  <path d="M74 36 L76 24 L64 30 Z" fill="#F48FB1"/>
  <ellipse cx="50" cy="54" rx="38" ry="32" fill="#FFFFFF" stroke="#4A3E3D" stroke-width="2.5"/>
  <circle cx="36" cy="50" r="3.5" fill="#4A3E3D"/>
  <circle cx="64" cy="50" r="3.5" fill="#4A3E3D"/>
  <circle cx="37.5" cy="48.5" r="1.2" fill="#FFFFFF"/>
  <circle cx="65.5" cy="48.5" r="1.2" fill="#FFFFFF"/>
  <ellipse cx="28" cy="58" rx="5" ry="3" fill="#FF80AB" opacity="0.6"/>
  <ellipse cx="72" cy="58" rx="5" ry="3" fill="#FF80AB" opacity="0.6"/>
  <path d="M50 55 L47 52 L53 52 Z" fill="#FF4081"/>
  <path d="M50 55 Q45 61 42 59 M50 55 Q55 61 58 59" stroke="#4A3E3D" stroke-width="2" stroke-linecap="round" fill="none"/>
  <line x1="20" y1="52" x2="10" y2="50" stroke="#4A3E3D" stroke-width="1.8" stroke-linecap="round"/>
  <line x1="20" y1="56" x2="11" y2="58" stroke="#4A3E3D" stroke-width="1.8" stroke-linecap="round"/>
  <line x1="80" y1="52" x2="90" y2="50" stroke="#4A3E3D" stroke-width="1.8" stroke-linecap="round"/>
  <line x1="80" y1="56" x2="89" y2="58" stroke="#4A3E3D" stroke-width="1.8" stroke-linecap="round"/>
</svg>`
  },
  {
    id: 'sticker-bear-brown',
    name: 'Brown Bear Hug',
    category: 'Animals',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="26" cy="28" r="14" fill="#B08968" stroke="#4A3E3D" stroke-width="2.5"/>
  <circle cx="74" cy="28" r="14" fill="#B08968" stroke="#4A3E3D" stroke-width="2.5"/>
  <circle cx="26" cy="28" r="7" fill="#E6CCB2"/>
  <circle cx="74" cy="28" r="7" fill="#E6CCB2"/>
  <ellipse cx="50" cy="54" rx="36" ry="30" fill="#B08968" stroke="#4A3E3D" stroke-width="2.5"/>
  <ellipse cx="50" cy="58" rx="16" ry="12" fill="#EDE0D4" stroke="#4A3E3D" stroke-width="2"/>
  <ellipse cx="50" cy="53" rx="5" ry="3.5" fill="#4A3E3D"/>
  <path d="M50 56.5 L50 62 M46 60 Q50 65 54 60" stroke="#4A3E3D" stroke-width="2" stroke-linecap="round" fill="none"/>
  <circle cx="34" cy="46" r="3.5" fill="#4A3E3D"/>
  <circle cx="66" cy="46" r="3.5" fill="#4A3E3D"/>
  <circle cx="35" cy="45" r="1.2" fill="#FFFFFF"/>
  <circle cx="67" cy="45" r="1.2" fill="#FFFFFF"/>
  <ellipse cx="26" cy="54" rx="4.5" ry="3" fill="#FF80AB" opacity="0.6"/>
  <ellipse cx="74" cy="54" rx="4.5" ry="3" fill="#FF80AB" opacity="0.6"/>
  <path d="M50 72 C42 62, 30 72, 50 88 C70 72, 58 62, 50 72 Z" fill="#FF5252" stroke="#4A3E3D" stroke-width="1.8"/>
</svg>`
  },
  {
    id: 'sticker-bunny-rabbit',
    name: 'Sweet Bunny',
    category: 'Animals',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <ellipse cx="36" cy="25" rx="8" ry="20" transform="rotate(-10 36 25)" fill="#FFFFFF" stroke="#4A3E3D" stroke-width="2.5"/>
  <ellipse cx="64" cy="25" rx="8" ry="20" transform="rotate(10 64 25)" fill="#FFFFFF" stroke="#4A3E3D" stroke-width="2.5"/>
  <ellipse cx="36" cy="25" rx="4" ry="14" transform="rotate(-10 36 25)" fill="#FF80AB"/>
  <ellipse cx="64" cy="25" rx="4" ry="14" transform="rotate(10 64 25)" fill="#FF80AB"/>
  <ellipse cx="50" cy="58" rx="34" ry="28" fill="#FFFFFF" stroke="#4A3E3D" stroke-width="2.5"/>
  <circle cx="37" cy="54" r="3.5" fill="#4A3E3D"/>
  <circle cx="63" cy="54" r="3.5" fill="#4A3E3D"/>
  <circle cx="38" cy="53" r="1.2" fill="#FFFFFF"/>
  <circle cx="64" cy="53" r="1.2" fill="#FFFFFF"/>
  <ellipse cx="28" cy="62" rx="4.5" ry="2.5" fill="#FF80AB" opacity="0.7"/>
  <ellipse cx="72" cy="62" rx="4.5" ry="2.5" fill="#FF80AB" opacity="0.7"/>
  <polygon points="50,60 47,57 53,57" fill="#FF4081"/>
  <path d="M50 60 Q46 64 43 62 M50 60 Q54 64 57 62" stroke="#4A3E3D" stroke-width="1.8" stroke-linecap="round" fill="none"/>
  <circle cx="68" cy="38" r="4.5" fill="#FFF59D" stroke="#4A3E3D" stroke-width="1.5"/>
  <circle cx="68" cy="38" r="2" fill="#FF8A80"/>
</svg>`
  },
  {
    id: 'sticker-shiba-dog',
    name: 'Shiba Inu Puppy',
    category: 'Animals',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <polygon points="20,44 14,20 38,30" fill="#E0A96D" stroke="#4A3E3D" stroke-width="2.5" stroke-linejoin="round"/>
  <polygon points="80,44 86,20 62,30" fill="#E0A96D" stroke="#4A3E3D" stroke-width="2.5" stroke-linejoin="round"/>
  <polygon points="22,40 18,25 34,32" fill="#FFF275"/>
  <polygon points="78,40 82,25 66,32" fill="#FFF275"/>
  <ellipse cx="50" cy="56" rx="36" ry="30" fill="#E0A96D" stroke="#4A3E3D" stroke-width="2.5"/>
  <path d="M22 62 Q36 46 50 56 Q64 46 78 62 Q70 86 50 86 Q30 86 22 62 Z" fill="#FFF8EE"/>
  <circle cx="36" cy="48" r="3.5" fill="#4A3E3D"/>
  <circle cx="64" cy="48" r="3.5" fill="#4A3E3D"/>
  <ellipse cx="36" cy="42" rx="3" ry="1.5" fill="#FFF8EE"/>
  <ellipse cx="64" cy="42" rx="3" ry="1.5" fill="#FFF8EE"/>
  <ellipse cx="50" cy="59" rx="4.5" ry="3" fill="#4A3E3D"/>
  <path d="M50 62 Q45 68 41 65 M50 62 Q55 68 59 65" stroke="#4A3E3D" stroke-width="1.8" stroke-linecap="round" fill="none"/>
  <ellipse cx="26" cy="56" rx="4.5" ry="3" fill="#FF8A80" opacity="0.6"/>
  <ellipse cx="74" cy="56" rx="4.5" ry="3" fill="#FF8A80" opacity="0.6"/>
</svg>`
  },

  // 2. Ribbons & Bows
  {
    id: 'sticker-coquette-bow',
    name: 'Coquette Pink Bow',
    category: 'Ribbons',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <path d="M50 44 C34 26, 12 30, 20 54 C26 70, 44 54, 50 48 Z" fill="#F8BBD0" stroke="#C2185B" stroke-width="2.2" stroke-linejoin="round"/>
  <path d="M50 44 C66 26, 88 30, 80 54 C74 70, 56 54, 50 48 Z" fill="#F8BBD0" stroke="#C2185B" stroke-width="2.2" stroke-linejoin="round"/>
  <path d="M30 40 C24 38, 22 46, 26 50" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" fill="none"/>
  <path d="M70 40 C76 38, 78 46, 74 50" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" fill="none"/>
  <path d="M46 50 C40 68, 28 80, 24 88 C32 82, 40 82, 46 72 Z" fill="#F48FB1" stroke="#C2185B" stroke-width="2" stroke-linejoin="round"/>
  <path d="M54 50 C60 68, 72 80, 76 88 C68 82, 60 82, 54 72 Z" fill="#F48FB1" stroke="#C2185B" stroke-width="2" stroke-linejoin="round"/>
  <ellipse cx="50" cy="46" rx="8" ry="7" fill="#EC407A" stroke="#C2185B" stroke-width="2.2"/>
  <circle cx="48" cy="44" r="2" fill="#FFFFFF"/>
</svg>`
  },
  {
    id: 'sticker-dainty-ribbon',
    name: 'Dainty Rose Ribbon',
    category: 'Ribbons',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <path d="M50 40 C38 24, 16 32, 24 50 C32 64, 46 48, 50 44 Z" fill="#FF80AB" stroke="#880E4F" stroke-width="2"/>
  <path d="M50 40 C62 24, 84 32, 76 50 C68 64, 54 48, 50 44 Z" fill="#FF80AB" stroke="#880E4F" stroke-width="2"/>
  <path d="M47 45 C43 60, 34 76, 30 84 C38 78, 44 78, 48 66 Z" fill="#FF4081" stroke="#880E4F" stroke-width="1.8"/>
  <path d="M53 45 C57 60, 66 76, 70 84 C62 78, 56 78, 52 66 Z" fill="#FF4081" stroke="#880E4F" stroke-width="1.8"/>
  <circle cx="50" cy="43" r="6" fill="#F50057" stroke="#880E4F" stroke-width="2"/>
  <circle cx="48" cy="41" r="1.5" fill="#FFFFFF"/>
</svg>`
  },
  {
    id: 'sticker-lavender-bow',
    name: 'Lavender Satin Bow',
    category: 'Ribbons',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <path d="M50 46 C32 28, 14 36, 22 56 C28 70, 44 54, 50 50 Z" fill="#E1BEE7" stroke="#6A1B9A" stroke-width="2.2"/>
  <path d="M50 46 C68 28, 86 36, 78 56 C72 70, 56 54, 50 50 Z" fill="#E1BEE7" stroke="#6A1B9A" stroke-width="2.2"/>
  <path d="M46 52 C38 68, 30 82, 26 88 C34 82, 42 82, 47 70 Z" fill="#CE93D8" stroke="#6A1B9A" stroke-width="2"/>
  <path d="M54 52 C62 68, 70 82, 74 88 C66 82, 58 82, 53 70 Z" fill="#CE93D8" stroke="#6A1B9A" stroke-width="2"/>
  <circle cx="50" cy="48" r="7.5" fill="#AB47BC" stroke="#6A1B9A" stroke-width="2.2"/>
  <circle cx="48" cy="46" r="2" fill="#FFFFFF"/>
</svg>`
  },

  // 3. Love & Flowers
  {
    id: 'sticker-sparkle-heart',
    name: 'Glitter Sparkle Heart',
    category: 'Love & Flowers',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <path d="M50 82 C20 62, 10 38, 26 22 C38 10, 48 20, 50 26 C52 20, 62 10, 74 22 C90 38, 80 62, 50 82 Z" fill="#FF69B4" stroke="#D81B60" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M30 28 C26 34, 26 42, 32 46" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" fill="none"/>
  <path d="M78 18 L80 12 L82 18 L88 20 L82 22 L80 28 L78 22 L72 20 Z" fill="#FFEE58" stroke="#F57F17" stroke-width="1.2"/>
  <path d="M18 64 L20 60 L22 64 L26 65 L22 66 L20 70 L18 66 L14 65 Z" fill="#FFEE58" stroke="#F57F17" stroke-width="1.2"/>
  <circle cx="70" cy="56" r="2" fill="#FFFFFF"/>
</svg>`
  },
  {
    id: 'sticker-sakura-flower',
    name: 'Cherry Blossom Sakura',
    category: 'Love & Flowers',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <g stroke="#C2185B" stroke-width="2" fill="#FCE4EC">
    <path d="M50 50 C40 25, 60 25, 50 12 C40 25, 60 25, 50 50 Z" />
    <path d="M50 50 C75 40, 75 60, 88 50 C75 40, 75 60, 50 50 Z" />
    <path d="M50 50 C60 75, 40 75, 50 88 C60 75, 40 75, 50 50 Z" />
    <path d="M50 50 C25 60, 25 40, 12 50 C25 60, 25 40, 50 50 Z" />
    <path d="M50 50 C28 28, 40 18, 22 22 C18 40, 28 28, 50 50 Z" />
    <path d="M50 50 C72 28, 60 18, 78 22 C82 40, 72 28, 50 50 Z" />
  </g>
  <circle cx="50" cy="50" r="7" fill="#FF80AB" stroke="#C2185B" stroke-width="1.8"/>
  <circle cx="50" cy="50" r="3" fill="#FFF59D"/>
</svg>`
  },
  {
    id: 'sticker-pink-daisy',
    name: 'Smiling Pink Daisy',
    category: 'Love & Flowers',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <g fill="#F8BBD0" stroke="#AD1457" stroke-width="2">
    <circle cx="50" cy="22" r="12"/>
    <circle cx="78" cy="50" r="12"/>
    <circle cx="50" cy="78" r="12"/>
    <circle cx="22" cy="50" r="12"/>
    <circle cx="70" cy="30" r="12"/>
    <circle cx="70" cy="70" r="12"/>
    <circle cx="30" cy="70" r="12"/>
    <circle cx="30" cy="30" r="12"/>
  </g>
  <circle cx="50" cy="50" r="16" fill="#FFEE58" stroke="#F57F17" stroke-width="2.2"/>
  <circle cx="44" cy="46" r="2.2" fill="#4A3E3D"/>
  <circle cx="56" cy="46" r="2.2" fill="#4A3E3D"/>
  <ellipse cx="40" cy="52" rx="2.5" ry="1.5" fill="#FF8A80" opacity="0.7"/>
  <ellipse cx="60" cy="52" rx="2.5" ry="1.5" fill="#FF8A80" opacity="0.7"/>
  <path d="M46 54 Q50 58 54 54" stroke="#4A3E3D" stroke-width="1.8" stroke-linecap="round" fill="none"/>
</svg>`
  },
  {
    id: 'sticker-tulip-pastel',
    name: 'Pastel Tulip',
    category: 'Love & Flowers',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <path d="M50 48 Q50 82 48 88" stroke="#66BB6A" stroke-width="3" stroke-linecap="round" fill="none"/>
  <path d="M50 68 Q36 60 32 78 Q44 76 50 68 Z" fill="#81C784" stroke="#388E3C" stroke-width="1.8"/>
  <path d="M50 64 Q64 54 68 72 Q56 70 50 64 Z" fill="#81C784" stroke="#388E3C" stroke-width="1.8"/>
  <path d="M50 14 C32 14, 26 36, 38 48 C46 54, 54 54, 62 48 C74 36, 68 14, 50 14 Z" fill="#FF4081" stroke="#AD1457" stroke-width="2.2"/>
  <path d="M50 14 C44 26, 44 46, 50 52 C56 46, 56 26, 50 14 Z" fill="#FF80AB" stroke="#AD1457" stroke-width="1.8"/>
  <path d="M36 28 C34 34, 36 40, 40 44" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" fill="none"/>
</svg>`
  },

  // 4. Fruits
  {
    id: 'sticker-sweet-strawberry',
    name: 'Sweet Strawberry',
    category: 'Fruits',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <path d="M50 28 C74 28, 86 52, 68 78 C58 92, 42 92, 32 78 C14 52, 26 28, 50 28 Z" fill="#FF1744" stroke="#B71C1C" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M30 42 C26 48, 28 58, 34 66" stroke="#FF8A80" stroke-width="2" stroke-linecap="round" fill="none"/>
  <g fill="#FFF9C4" stroke="#E65100" stroke-width="0.8">
    <ellipse cx="42" cy="40" rx="1.5" ry="2.2"/>
    <ellipse cx="58" cy="40" rx="1.5" ry="2.2"/>
    <ellipse cx="50" cy="50" rx="1.5" ry="2.2"/>
    <ellipse cx="36" cy="56" rx="1.5" ry="2.2"/>
    <ellipse cx="64" cy="56" rx="1.5" ry="2.2"/>
    <ellipse cx="44" cy="66" rx="1.5" ry="2.2"/>
    <ellipse cx="56" cy="66" rx="1.5" ry="2.2"/>
    <ellipse cx="50" cy="78" rx="1.5" ry="2.2"/>
  </g>
  <path d="M50 14 Q52 24 50 28" stroke="#4CAF50" stroke-width="3" stroke-linecap="round" fill="none"/>
  <path d="M50 28 C42 16, 26 24, 34 32 C40 32, 46 30, 50 28 Z" fill="#66BB6A" stroke="#2E7D32" stroke-width="1.8"/>
  <path d="M50 28 C58 16, 74 24, 66 32 C60 32, 54 30, 50 28 Z" fill="#66BB6A" stroke="#2E7D32" stroke-width="1.8"/>
  <path d="M50 28 C46 22, 54 22, 50 34 Z" fill="#81C784" stroke="#2E7D32" stroke-width="1.5"/>
</svg>`
  },
  {
    id: 'sticker-twin-cherries',
    name: 'Twin Cherries',
    category: 'Fruits',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <path d="M34 60 C38 36, 52 24, 64 16" stroke="#4CAF50" stroke-width="2.5" stroke-linecap="round" fill="none"/>
  <path d="M68 64 C64 42, 60 28, 64 16" stroke="#4CAF50" stroke-width="2.5" stroke-linecap="round" fill="none"/>
  <path d="M64 16 C76 12, 84 22, 74 28 C68 28, 64 22, 64 16 Z" fill="#81C784" stroke="#2E7D32" stroke-width="1.8"/>
  <circle cx="34" cy="66" r="18" fill="#D50000" stroke="#5F0909" stroke-width="2.5"/>
  <circle cx="30" cy="60" r="3.5" fill="#FF8A80"/>
  <circle cx="68" cy="70" r="18" fill="#D50000" stroke="#5F0909" stroke-width="2.5"/>
  <circle cx="64" cy="64" r="3.5" fill="#FF8A80"/>
  <circle cx="28" cy="66" r="1.8" fill="#4A3E3D"/>
  <circle cx="38" cy="66" r="1.8" fill="#4A3E3D"/>
  <path d="M31 70 Q33 73 35 70" stroke="#4A3E3D" stroke-width="1.2" stroke-linecap="round" fill="none"/>
  <circle cx="62" cy="70" r="1.8" fill="#4A3E3D"/>
  <circle cx="72" cy="70" r="1.8" fill="#4A3E3D"/>
  <path d="M65 74 Q67 77 69 74" stroke="#4A3E3D" stroke-width="1.2" stroke-linecap="round" fill="none"/>
</svg>`
  },
  {
    id: 'sticker-juicy-peach',
    name: 'Juicy Pastel Peach',
    category: 'Fruits',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <path d="M48 24 C56 12, 70 16, 64 26 C58 28, 52 26, 48 24 Z" fill="#81C784" stroke="#2E7D32" stroke-width="1.8"/>
  <path d="M50 26 C28 26, 16 48, 30 72 C42 90, 50 88, 50 86 C50 88, 58 90, 70 72 C84 48, 72 26, 50 26 Z" fill="#FFAB91" stroke="#BF360C" stroke-width="2.5"/>
  <path d="M50 26 Q48 54 50 78" stroke="#FF5722" stroke-width="2" stroke-linecap="round" fill="none"/>
  <ellipse cx="32" cy="58" rx="5" ry="3" fill="#FF7043" opacity="0.6"/>
  <ellipse cx="68" cy="58" rx="5" ry="3" fill="#FF7043" opacity="0.6"/>
  <circle cx="36" cy="50" r="2.5" fill="#4A3E3D"/>
  <circle cx="64" cy="50" r="2.5" fill="#4A3E3D"/>
  <path d="M47 56 Q50 60 53 56" stroke="#4A3E3D" stroke-width="1.5" stroke-linecap="round" fill="none"/>
</svg>`
  },

  // 5. Birthday & Celebrations
  {
    id: 'sticker-birthday-cupcake',
    name: 'Birthday Cupcake',
    category: 'Birthday',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <polygon points="28,58 72,58 64,88 36,88" fill="#80DEEA" stroke="#00838F" stroke-width="2.2"/>
  <line x1="36" y1="58" x2="42" y2="88" stroke="#00838F" stroke-width="1.5"/>
  <line x1="50" y1="58" x2="50" y2="88" stroke="#00838F" stroke-width="1.5"/>
  <line x1="64" y1="58" x2="58" y2="88" stroke="#00838F" stroke-width="1.5"/>
  <path d="M22 58 C18 48, 30 40, 42 42 C46 32, 58 32, 64 38 C74 36, 82 46, 78 58 Z" fill="#F8BBD0" stroke="#C2185B" stroke-width="2.5" stroke-linejoin="round"/>
  <circle cx="34" cy="48" r="1.8" fill="#FFD54F"/>
  <circle cx="48" cy="44" r="1.8" fill="#69F0AE"/>
  <circle cx="62" cy="46" r="1.8" fill="#BA68C8"/>
  <circle cx="42" cy="54" r="1.8" fill="#FF8A80"/>
  <circle cx="58" cy="54" r="1.8" fill="#40C4FF"/>
  <rect x="47" y="22" width="6" height="18" fill="#FFF59D" stroke="#F57F17" stroke-width="1.5"/>
  <path d="M50 10 C46 16, 46 20, 50 22 C54 20, 54 16, 50 10 Z" fill="#FF7043" stroke="#D84315" stroke-width="1.2"/>
</svg>`
  },
  {
    id: 'sticker-celebration-cake',
    name: 'Celebration Cake',
    category: 'Birthday',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect x="20" y="56" width="60" height="30" rx="6" fill="#F8BBD0" stroke="#AD1457" stroke-width="2.5"/>
  <path d="M20 62 Q28 70 35 62 Q42 70 50 62 Q58 70 65 62 Q72 70 80 62 L80 56 L20 56 Z" fill="#FFFFFF" stroke="#AD1457" stroke-width="1.8"/>
  <rect x="28" y="38" width="44" height="20" rx="4" fill="#E1BEE7" stroke="#6A1B9A" stroke-width="2.2"/>
  <path d="M28 44 Q34 50 39 44 Q44 50 50 44 Q56 50 61 44 Q66 50 72 44 L72 38 L28 38 Z" fill="#FFFFFF" stroke="#6A1B9A" stroke-width="1.5"/>
  <circle cx="36" cy="34" r="4.5" fill="#D50000" stroke="#4A3E3D" stroke-width="1.5"/>
  <circle cx="50" cy="34" r="4.5" fill="#D50000" stroke="#4A3E3D" stroke-width="1.5"/>
  <circle cx="64" cy="34" r="4.5" fill="#D50000" stroke="#4A3E3D" stroke-width="1.5"/>
  <rect x="48" y="16" width="4" height="14" fill="#FFEE58" stroke="#F57F17" stroke-width="1.2"/>
  <path d="M50 8 C47 12, 47 14, 50 16 C53 14, 53 12, 50 8 Z" fill="#FF5722"/>
</svg>`
  },

  // 6. Stars & Butterflies
  {
    id: 'sticker-sparkle-star',
    name: 'Golden Sparkle Star',
    category: 'Stars & Magic',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <path d="M50 8 C48 34, 34 48, 8 50 C34 52, 48 66, 50 92 C52 66, 66 52, 92 50 C66 48, 52 34, 50 8 Z" fill="#FFD54F" stroke="#FF8F00" stroke-width="2.5" stroke-linejoin="round"/>
  <circle cx="50" cy="50" r="8" fill="#FFF9C4"/>
  <circle cx="48" cy="48" r="3" fill="#FFFFFF"/>
  <circle cx="78" cy="22" r="3" fill="#FFEE58"/>
  <circle cx="22" cy="78" r="2.5" fill="#FFEE58"/>
</svg>`
  },
  {
    id: 'sticker-lavender-butterfly',
    name: 'Pastel Butterfly',
    category: 'Stars & Magic',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <path d="M50 46 C42 18, 14 24, 18 52 C22 66, 44 56, 50 48 Z" fill="#E1BEE7" stroke="#4A148C" stroke-width="2.2"/>
  <path d="M50 46 C58 18, 86 24, 82 52 C78 66, 56 56, 50 48 Z" fill="#E1BEE7" stroke="#4A148C" stroke-width="2.2"/>
  <path d="M50 50 C40 56, 24 64, 28 78 C34 86, 48 72, 50 54 Z" fill="#F8BBD0" stroke="#880E4F" stroke-width="2"/>
  <path d="M50 50 C60 56, 76 64, 72 78 C66 86, 52 72, 50 54 Z" fill="#F8BBD0" stroke="#880E4F" stroke-width="2"/>
  <ellipse cx="50" cy="52" rx="3.5" ry="16" fill="#4A3E3D"/>
  <circle cx="50" cy="34" r="4.5" fill="#4A3E3D"/>
  <path d="M48 32 Q42 22 36 24" stroke="#4A3E3D" stroke-width="1.8" stroke-linecap="round" fill="none"/>
  <path d="M52 32 Q58 22 64 24" stroke="#4A3E3D" stroke-width="1.8" stroke-linecap="round" fill="none"/>
  <circle cx="32" cy="40" r="3.5" fill="#FFFFFF"/>
  <circle cx="68" cy="40" r="3.5" fill="#FFFFFF"/>
</svg>`
  },
  {
    id: 'sticker-twinkle-cluster',
    name: 'Twinkle Stars Trio',
    category: 'Stars & Magic',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <!-- Big Pink Star -->
  <path d="M42 20 L46 36 L62 40 L46 44 L42 60 L38 44 L22 40 L38 36 Z" fill="#FF80AB" stroke="#C2185B" stroke-width="2" stroke-linejoin="round"/>
  <!-- Medium Yellow Star -->
  <path d="M72 48 L75 58 L85 61 L75 64 L72 74 L69 64 L59 61 L69 58 Z" fill="#FFF59D" stroke="#F57F17" stroke-width="1.8" stroke-linejoin="round"/>
  <!-- Small Blue Star -->
  <path d="M26 66 L28 73 L35 75 L28 77 L26 84 L24 77 L17 75 L24 73 Z" fill="#80D8FF" stroke="#0091EA" stroke-width="1.5" stroke-linejoin="round"/>
  <circle cx="70" cy="24" r="2.5" fill="#FFD54F"/>
  <circle cx="20" cy="28" r="2" fill="#FF80AB"/>
</svg>`
  },

  // 7. Vintage Camera & Film
  {
    id: 'sticker-retro-camera',
    name: 'Retro Pastel Camera',
    category: 'Vintage & Deco',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect x="16" y="32" width="68" height="48" rx="8" fill="#B2DFDB" stroke="#004D40" stroke-width="2.5"/>
  <rect x="22" y="24" width="20" height="10" rx="3" fill="#80CBC4" stroke="#004D40" stroke-width="2"/>
  <circle cx="72" cy="26" r="4.5" fill="#FF8A80" stroke="#004D40" stroke-width="1.8"/>
  <rect x="16" y="44" width="68" height="8" fill="#E0F2F1"/>
  <circle cx="50" cy="56" r="18" fill="#ECEFF1" stroke="#004D40" stroke-width="2.5"/>
  <circle cx="50" cy="56" r="12" fill="#263238"/>
  <circle cx="50" cy="56" r="7" fill="#37474F"/>
  <circle cx="47" cy="53" r="2.5" fill="#80D8FF"/>
  <circle cx="28" cy="40" r="3.5" fill="#FFF59D" stroke="#004D40" stroke-width="1.5"/>
</svg>`
  },
  {
    id: 'sticker-vintage-film',
    name: 'Vintage Film Strip',
    category: 'Vintage & Deco',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect x="14" y="25" width="72" height="50" rx="4" fill="#263238" stroke="#000000" stroke-width="2.5"/>
  <!-- Top sprocket holes -->
  <rect x="20" y="28" width="6" height="5" rx="1" fill="#FFFFFF"/>
  <rect x="32" y="28" width="6" height="5" rx="1" fill="#FFFFFF"/>
  <rect x="44" y="28" width="6" height="5" rx="1" fill="#FFFFFF"/>
  <rect x="56" y="28" width="6" height="5" rx="1" fill="#FFFFFF"/>
  <rect x="68" y="28" width="6" height="5" rx="1" fill="#FFFFFF"/>
  <!-- Frames -->
  <rect x="22" y="38" width="24" height="24" rx="2" fill="#ECEFF1"/>
  <path d="M26 56 L34 46 L42 56 Z" fill="#90A4AE"/>
  <circle cx="38" cy="44" r="2.5" fill="#FFB74D"/>
  <rect x="52" y="38" width="24" height="24" rx="2" fill="#ECEFF1"/>
  <path d="M64 54 C58 48, 54 42, 60 38 C64 36, 68 40, 72 44 Z" fill="#F48FB1"/>
  <!-- Bottom sprocket holes -->
  <rect x="20" y="67" width="6" height="5" rx="1" fill="#FFFFFF"/>
  <rect x="32" y="67" width="6" height="5" rx="1" fill="#FFFFFF"/>
  <rect x="44" y="67" width="6" height="5" rx="1" fill="#FFFFFF"/>
  <rect x="56" y="67" width="6" height="5" rx="1" fill="#FFFFFF"/>
  <rect x="68" y="67" width="6" height="5" rx="1" fill="#FFFFFF"/>
</svg>`
  },

  // 8. Scrapbook Decorations
  {
    id: 'sticker-washi-tape',
    name: 'Gingham Washi Tape',
    category: 'Vintage & Deco',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <g transform="rotate(-15 50 50)">
    <rect x="12" y="36" width="76" height="28" fill="#F8BBD0" stroke="#E91E63" stroke-width="1.5" stroke-dasharray="3 3" opacity="0.9"/>
    <!-- Gingham Pattern lines -->
    <line x1="24" y1="36" x2="24" y2="64" stroke="#F06292" stroke-width="2.5" opacity="0.6"/>
    <line x1="38" y1="36" x2="38" y2="64" stroke="#F06292" stroke-width="2.5" opacity="0.6"/>
    <line x1="52" y1="36" x2="52" y2="64" stroke="#F06292" stroke-width="2.5" opacity="0.6"/>
    <line x1="66" y1="36" x2="66" y2="64" stroke="#F06292" stroke-width="2.5" opacity="0.6"/>
    <line x1="12" y1="44" x2="88" y2="44" stroke="#F06292" stroke-width="2.5" opacity="0.6"/>
    <line x1="12" y1="56" x2="88" y2="56" stroke="#F06292" stroke-width="2.5" opacity="0.6"/>
    <!-- Torn ends -->
    <path d="M12 36 L15 43 L12 50 L15 57 L12 64" stroke="#E91E63" stroke-width="1.5" fill="none"/>
    <path d="M88 36 L85 43 L88 50 L85 57 L88 64" stroke="#E91E63" stroke-width="1.5" fill="none"/>
  </g>
</svg>`
  },
  {
    id: 'sticker-postage-stamp',
    name: 'Postage Stamp Heart',
    category: 'Vintage & Deco',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect x="20" y="16" width="60" height="68" rx="2" fill="#FFF9C4" stroke="#795548" stroke-width="2" stroke-dasharray="4 4"/>
  <rect x="26" y="22" width="48" height="56" fill="#FCE4EC" stroke="#C2185B" stroke-width="1.5"/>
  <path d="M50 56 C38 44, 34 34, 42 28 C48 24, 50 30, 50 32 C50 30, 52 24, 58 28 C66 34, 62 44, 50 56 Z" fill="#E91E63"/>
  <text x="50" y="70" font-family="sans-serif" font-size="7" font-weight="bold" fill="#880E4F" text-anchor="middle">UNISMILES</text>
  <text x="68" y="32" font-family="sans-serif" font-size="6" font-weight="bold" fill="#880E4F">10¢</text>
</svg>`
  },
  {
    id: 'sticker-heart-paperclip',
    name: 'Heart Wire Paperclip',
    category: 'Vintage & Deco',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <path d="M50 78 C28 56, 18 36, 32 20 C42 10, 48 18, 50 24 C52 18, 58 10, 68 20 C82 36, 72 56, 50 78 Z" fill="none" stroke="#D4AF37" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M50 64 C36 48, 28 34, 38 24 C44 18, 48 24, 50 28 C52 24, 56 18, 62 24 C72 34, 64 48, 50 64 Z" fill="none" stroke="#D4AF37" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="50" cy="78" r="2.5" fill="#FFF59D"/>
</svg>`
  },
  {
    id: 'sticker-star-pushpin',
    name: 'Star Pushpin Deco',
    category: 'Vintage & Deco',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <!-- Shadow -->
  <ellipse cx="54" cy="62" rx="18" ry="8" fill="#000000" opacity="0.25"/>
  <!-- Pin Needle -->
  <line x1="50" y1="48" x2="54" y2="62" stroke="#78909C" stroke-width="3" stroke-linecap="round"/>
  <!-- Star Head -->
  <polygon points="50,18 56,32 72,32 58,42 64,56 50,46 36,56 42,42 28,32 44,32" fill="#FFEE58" stroke="#F57F17" stroke-width="2.5" stroke-linejoin="round"/>
  <polygon points="50,24 54,34 64,34 56,40 60,50 50,42 40,50 44,40 36,34 46,34" fill="#FFF9C4"/>
</svg>`
  }
];

export function getDefaultScrapbookAssets(): Array<{
  id: string;
  name: string;
  category: string;
  type: 'sticker';
  url: string;
  resolvedUrl: string;
  is_active: boolean;
  isLocal: boolean;
}> {
  return STICKER_DEFINITIONS.map(item => {
    const encodedSvg = `data:image/svg+xml;utf8,${encodeURIComponent(item.svg)}`;
    return {
      id: item.id,
      name: item.name,
      category: item.category,
      type: 'sticker' as const,
      url: encodedSvg,
      resolvedUrl: encodedSvg,
      is_active: true,
      isLocal: true,
    };
  });
}

