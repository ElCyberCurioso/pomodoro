/*
 * Configuración inicial de tu Pomodoro
 * ------------------------------------
 * Edita este archivo en tu repositorio para decidir con qué listas de música
 * y ajustes arranca la app la primera vez que alguien la abre.
 *
 * Después, cada persona puede cambiarlo todo desde la propia app
 * (se guarda en su navegador y no afecta a nadie más).
 *
 * En "items" puedes poner:
 *   - Enlaces de vídeos o directos:  https://www.youtube.com/watch?v=XXXXXXXXXXX
 *   - Enlaces cortos:                https://youtu.be/XXXXXXXXXXX
 *   - Listas de reproducción:        https://www.youtube.com/playlist?list=PLxxxxxxxx
 *   - El ID suelto del vídeo:        'XXXXXXXXXXX'
 * El título es opcional: si lo dejas vacío, la app lo pide a YouTube.
 */
window.POMODORO_CONFIG = {
  appName: 'Pomodoro',

  playlists: [
    {
      name: 'Concentración',
      items: [
        { url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk', title: 'lofi hip hop radio 📚 beats to relax/study to' },
        { url: 'https://www.youtube.com/watch?v=TtkFsfOP9QI', title: 'peaceful piano radio 🎹 music to focus/study to' },
        { url: 'https://www.youtube.com/watch?v=5yx6BWlEVcY', title: 'Chillhop Radio · jazzy & lofi hip hop beats' },
        { url: 'https://www.youtube.com/watch?v=4xDzrJKXOOY', title: 'synthwave radio 🌌 beats to chill/game to' },
      ],
    },
    {
      name: 'Calma',
      items: [
        { url: 'https://www.youtube.com/watch?v=Dx5qFachd3A', title: 'Relaxing Jazz Piano Radio' },
        { url: 'https://www.youtube.com/watch?v=mPZkdNFkNps', title: 'Lluvia en la ventana con tormenta' },
        { url: 'https://www.youtube.com/watch?v=rUxyKA_-grg', title: 'lofi hip hop radio 💤 beats to sleep/chill to' },
      ],
    },
  ],

  // Opcional: ajustes por defecto. Quita las barras // de lo que quieras cambiar.
  settings: {
    timer: {
      focus: 25,       // minutos de concentración
      short: 5,        // minutos de pausa corta
      long: 15,        // minutos de pausa larga
      longEvery: 4,    // pausa larga cada N pomodoros
      // autoBreaks: true,
      // autoFocus: false,
      // dailyGoal: 8,
    },
    look: {
      theme: 'musgo',  // musgo, tomate, medianoche, oceano, grafito, niebla, salvia, cerezo
      // backdrop: 'video',     // 'video', 'image' o 'color'
      // timerFont: 'fraunces', // fraunces, hanken, bigshoulders, unbounded, bodoni, quicksand, jetbrains, system
      // clockStyle: 'classic', // 'classic', 'ring' o 'minimal'
    },
    music: {
      // volume: 60,
      // breakBehavior: 'duck', // 'keep', 'duck' o 'pause'
    },
  },
};
