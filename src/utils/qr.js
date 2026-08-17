// Generación de la imagen del código QR. Se apoya en un servicio público y
// gratuito (goqr.me / api.qrserver.com, sin necesidad de clave) que solo
// recibe la URL de consulta a dibujar como imagen — la misma URL que
// cualquiera vería igual si el guardia se la dictara en voz alta, no viaja
// ningún dato personal del visitante. No requiere ninguna librería extra en
// el proyecto.
export function qrImageUrl(data, size = 260) {
  const params = new URLSearchParams({ size: `${size}x${size}`, data, margin: "8" });
  return `https://api.qrserver.com/v1/create-qr-code/?${params.toString()}`;
}
