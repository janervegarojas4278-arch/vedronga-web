# Moderación de Comunidad VEDRONGA

Esta carpeta prepara la primera etapa del backend de moderación. La migración crea publicaciones, comentarios, reportes y un bucket privado. El contenido empieza como `pending`; solo una cuenta administradora puede cambiarlo a `approved`.

## Estado actual

La página publicada todavía usa `localStorage` e IndexedDB en cada navegador. La migración por sí sola no cambia la página ni activa la aprobación. Hace falta crear el proyecto de Supabase, ejecutar la migración e integrar autenticación, formularios y el panel de revisión en el sitio.

## Configuración cuando se cree el proyecto

1. Crear un proyecto nuevo en Supabase.
2. Abrir **SQL Editor** y ejecutar `migrations/202611020001_community_moderation.sql` una sola vez.
3. Crear el usuario administrador en Supabase Auth y copiar su UUID.
4. Ejecutar por separado, sustituyendo el marcador por ese UUID:

   ```sql
   insert into public.community_admins (user_id)
   values ('PASTE_AUTH_USER_UUID_HERE');
   ```

5. Después conectar la página a Supabase Auth, tablas y Storage. No colocar una `service_role` o `secret` key en HTML, JavaScript público, GitHub ni en esta carpeta.

## Reglas de publicación que aplica la migración

- Visitantes sin iniciar sesión solo pueden leer publicaciones y comentarios aprobados.
- Cada publicación y comentario nuevo entra como `pending`.
- Los archivos se guardan en el bucket privado `community-media`; el acceso público solo se permite para archivos de publicaciones aprobadas.
- Los reportes requieren una cuenta y solo el administrador puede revisarlos.
- La aprobación es manual. Esta etapa no incluye detección automática de groserías, desnudos, violencia ni datos personales.

## Límites del plan gratuito consultados el 2 de noviembre de 2026

El plan Free anuncia 1 GB de almacenamiento y el límite máximo por archivo es 50 MB. Algunos videos de dos minutos pueden superar ese tamaño; para esos casos habría que comprimirlos o elegir otro almacenamiento. Los proyectos Free pueden pausarse tras una semana de inactividad.

- https://supabase.com/pricing
- https://supabase.com/docs/guides/storage/uploads/file-limits
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/storage/security/access-control
