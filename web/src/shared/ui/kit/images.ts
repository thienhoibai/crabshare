/* Ảnh minh hoạ theo loại cua, đặt ở web/public/minhbach. */
export const IMG = {
  gach: '/minhbach/cua-gach-card.jpg',
  thit: '/minhbach/cua-thit-card.jpg',
  hop: '/minhbach/cua-hop-card.jpg',
  com: '/minhbach/cua-com-card.jpg',
}

/** Ảnh ngoài (có tham số w=) thì đổi sang bề rộng cần dùng; ảnh trong public giữ nguyên. */
export const small = (src: string, w = 720) => (src.startsWith('http') ? src.replace(/w=\d+/, `w=${w}`) : src)
