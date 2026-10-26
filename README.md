# Pomodoro

Temporizador Pomodoro con música de YouTube de fondo, tareas y estadísticas. Es una web estática (HTML, CSS y JavaScript sin dependencias ni compilación), así que se publica tal cual en GitHub Pages.

## Qué incluye

- **Temporizador** de concentración, pausa corta y pausa larga, con series configurables, arranque automático de fases y aviso sonoro (sintetizado, sin archivos de audio). Es exacto aunque la pestaña esté en segundo plano y recuerda dónde ibas si recargas la página.
- **Música de YouTube**: varias listas propias con vídeos, directos o listas de reproducción completas. El vídeo puede ir de fondo detrás del reloj o en una ventana flotante. Durante las pausas la música puede seguir, bajar de volumen o pausarse, y vuelve sola al concentrarte.
- **Compartir listas** con un enlace: quien lo abre puede añadir tu lista a la suya.
- **Tareas** con pomodoros estimados, tarea activa y hora estimada de fin.
- **Estadísticas**: pomodoros de hoy, objetivo diario, semana, racha y gráfico de los últimos 14 días.
- **Personalización**: 8 temas y colores a tu gusto, fondo de color, imagen o vídeo (con capa de color y desenfoque), 8 tipografías para el reloj, estilo barra, anillo o solo cifras, tamaño, tipografía de la interfaz y mucho más.
- **Comodidad**: los controles se ocultan solos mientras te concentras, modo sin distracciones, pantalla completa, temporizador flotante (Chrome/Edge), notificaciones, pantalla siempre encendida en el móvil, cuenta atrás en la pestaña y atajos de teclado.
- **Instalable** como app (PWA) y funciona sin conexión salvo la música.
- **Privacidad**: no hay cuentas ni servidor. Todo se guarda en el navegador de cada persona y se puede exportar o importar como copia.

## Publicarla en GitHub Pages

1. Crea un repositorio nuevo en GitHub (por ejemplo `pomodoro`).
2. Sube el contenido de esta carpeta a la raíz del repositorio: `index.html`, `config.js`, `sw.js`, `manifest.webmanifest`, `.nojekyll` y las carpetas `css`, `js` e `icons`. Puedes arrastrarlos en **Add file → Upload files** o usar git:

   ```bash
   git init
   git add .
   git commit -m "Pomodoro"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/pomodoro.git
   git push -u origin main
   ```

3. En el repositorio ve a **Settings → Pages**. En **Build and deployment**, elige **Deploy from a branch**, rama `main` y carpeta `/ (root)`, y guarda.
4. En uno o dos minutos estará en `https://TU_USUARIO.github.io/pomodoro/`.

## Definir tus listas de música

Edita `config.js`. En `playlists` pon las listas con las que arranca la app:

```js
playlists: [
  {
    name: 'Concentración',
    items: [
      { url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk', title: 'lofi hip hop radio' },
      { url: 'https://www.youtube.com/playlist?list=PLxxxxxxxxxxxx' },   // lista completa
      'https://youtu.be/XXXXXXXXXXX',                                    // también vale solo el enlace
    ],
  },
],
```

El título es opcional; si falta, la app lo pide a YouTube. En `settings` puedes cambiar los valores por defecto (duraciones, tema, fondo, tipografía…).

`config.js` solo se aplica la **primera vez** que alguien abre la app. Después, cada persona gestiona sus listas desde el panel **Música** y sus cambios se guardan en su navegador. Si cambias `config.js` y quieres verlo en tu navegador, ve a **Ajustes → Tus datos → Listas iniciales**.

## Probarla en tu ordenador

YouTube no funciona si abres `index.html` con doble clic (como archivo local). Levanta un servidor en la carpeta:

```bash
python3 -m http.server 8000
```

y abre `http://localhost:8000`.

## Atajos de teclado

| Tecla | Acción |
| --- | --- |
| Espacio | Empezar o pausar |
| R / S | Reiniciar la fase / saltar a la siguiente |
| 1, 2, 3 | Concentración, pausa corta, pausa larga |
| K / N / B | Música: reproducir o pausar / siguiente / anterior |
| M | Silenciar la música |
| V | Vídeo de fondo o en ventana |
| T / Y / E / , | Tareas / música / estadísticas / ajustes |
| Z / F | Modo sin distracciones / pantalla completa |
| Esc | Cerrar panel |

## Limitaciones conocidas

- Algunos vídeos no permiten reproducirse fuera de YouTube (su autor lo desactiva); la app lo indica y pasa al siguiente.
- En el móvil, los navegadores detienen la música cuando se apaga la pantalla o cambias de app. Activa **Mantener la pantalla encendida** en los ajustes.
- El control de volumen no funciona en iPhone y iPad (iOS no lo permite); usa los botones del dispositivo.
- Las listas privadas, «Ver más tarde», «Me gusta» y los mixes automáticos de YouTube no se pueden incrustar.

## Estructura

```
index.html            Estructura de la página
config.js             Listas y ajustes iniciales (edítalo)
css/styles.css        Estilos y temas
js/main.js            Arranque y conexión de todo
js/timer.js           Motor del temporizador
js/music.js           Listas, cola y sincronía con las fases
js/youtube.js         Enlaces, metadatos y reproductor de YouTube
js/tasks.js           Tareas
js/stats.js           Estadísticas
js/settings.js        Panel de ajustes
js/themes.js          Temas y tipografías
js/sounds.js          Avisos sonoros
js/store.js           Guardado en el navegador
sw.js                 Uso sin conexión e instalación
```

Para añadir un tema nuevo, agrégalo en `THEMES` dentro de `js/themes.js`; aparecerá solo en los ajustes.
