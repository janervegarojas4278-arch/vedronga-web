# Moderación de Comunidad VEDRONGA

Esta carpeta prepara la primera etapa del backend de moderación. La migración crea publicaciones, comentarios, reportes y un bucket privado. El contenido empieza como `pending`; solo una cuenta administradora puede cambiarlo a `approved`.

## Estado actual

La migración se ejecuta en el proyecto `VEDRONGA-Comunidad`. El sitio en `docs/` tiene el cliente de Supabase, autenticación, formularios, carga privada y una bandeja de aprobación. Esos cambios de código deben subirse a GitHub Pages para que el sitio publicado los use.

## Pasos pendientes

1. En **Authentication > URL Configuration**, configurar el sitio como `https://janervegarojas4278-arch.github.io/vedronga-web/` y añadir esa misma dirección a **Redirect URLs** para la confirmación de correo.
2. Verificar que el bucket `community-media` se mantenga privado.
3. Subir a GitHub los cambios de `docs/` para actualizar GitHub Pages.

La clave `sb_publishable_...` está en `docs/supabase-config.js`; puede estar en el código público porque las tablas y Storage usan RLS. Nunca pongas una `sb_secret_...` o `service_role` key en este archivo.

## Reglas de publicación que aplica la migración

- Visitantes sin iniciar sesión solo pueden leer publicaciones y comentarios aprobados.
- Cada publicación y comentario nuevo entra como `pending`.
- Los archivos se guardan en el bucket privado `community-media`; el acceso público solo se permite para archivos de publicaciones aprobadas.
- Los reportes requieren una cuenta y solo el administrador puede revisarlos.
- La aprobación es manual. No incluye detección automática de groserías, desnudos, violencia ni datos personales; el administrador debe revisar archivos y comentarios antes de aprobar.

## Límites del plan gratuito consultados el 2 de noviembre de 2026

El plan Free anuncia 1 GB de almacenamiento y el límite máximo por archivo es 50 MB. Algunos videos de dos minutos pueden superar ese tamaño; para esos casos habría que comprimirlos o elegir otro almacenamiento. Los proyectos Free pueden pausarse tras una semana de inactividad.

- https://supabase.com/pricing
- https://supabase.com/docs/guides/storage/uploads/file-limits
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/storage/security/access-control
