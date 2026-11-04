# Portafolio VEDRONGA

El portafolio está dividido en dos grupos dentro de `index.html`: primero las fotografías (`#portfolioPhotos`) y luego los videos (`#portfolioVideos`). La cuadrícula respeta el orden de los elementos en el HTML y se adapta a computador, tableta y celular.

## Agregar una fotografía

1. Copia la foto optimizada a `docs/img/`, por ejemplo `img9.JPG`.
2. En `index.html`, dentro de `<div class="gallery" id="portfolioPhotos">`, duplica una figura de foto y cambia `src`, `alt`, el número y el texto.
3. Pega la figura nueva al final de las fotos, antes de `</div>` de `portfolioPhotos`. Así aparece después de las anteriores.

## Agregar o reemplazar un video

Los dos videos actuales están en `docs/videos/` como MP4 comprimidos para la web. Cada portada se extrajo del propio video y se configura con `poster`.

Para reemplazar uno, conserva la ruta `videos/video1.mp4` o `videos/video2.mp4`, o cambia esa ruta en su elemento `<video>` dentro de `#portfolioVideos`. Copia también una portada JPG a `docs/videos/` y actualiza el valor de `poster`. Mantén las figuras de video dentro de `#portfolioVideos`, debajo de la cuadrícula de fotos.

En una página estática, los videos también se guardan en el repositorio al publicarse. Conviene comprimirlos antes de agregarlos para que carguen bien y no hagan pesado el sitio.
