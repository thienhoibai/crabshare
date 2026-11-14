/**
 * Công cụ demo: các nút làm thay bước phụ thuộc bên ngoài (ngân hàng báo có, hạn góp ý) để chạy trọn luồng trong một buổi.
 * Luôn có khi chạy dev. Bản build chỉ có khi đặt VITE_DEMO_TOOLS=true lúc build, dành cho môi trường demo hoặc kiểm thử
 * không có tiền thật; API của môi trường đó cũng phải bật Demo:Tools (docs/deploy.md).
 */
export const demoTools = import.meta.env.DEV || import.meta.env.VITE_DEMO_TOOLS === 'true'
