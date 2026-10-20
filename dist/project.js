// Project metadata. Add the paper and code URLs when they are public.
// Affiliation numbers refer to positions in affiliations, starting at 1.
// Example: authors: [{ name: 'Full Name', affiliations: [1], url: 'https://…' }]
window.RAY_SCR_PROJECT = {
  authors: [
    { name: 'Jaemin Cho', affiliations: [1], url: 'https://jaeminch0.github.io/' },
    { name: 'Oleksii Nasypanyi', affiliations: [1], url: 'https://www.linkedin.com/in/oleksii-nasypanyi-95a23a223/' },
    { name: 'Francois Rameau', affiliations: [2], url: 'https://frameau.xyz/' },
  ],
  affiliations: ['Stony Brook University', 'SUNY Korea'],
  paperUrl: '',
  arxivUrl: '',
  codeUrl: 'https://github.com/JAEMINCH0/Ray-SCR',
  // Result assets are keyed by backbone, then camera. Leave missing pairs empty.
  demo: {
    defaultBackbone: 'ace-g',
    results: {
      'ace-g': {
        '360': { type: 'video', src: 'assets/piatrium.mp4', poster: 'assets/piatrium-poster.png' },
        fisheye1: { type: 'image', src: 'assets/fisheye1-result.webp' },
        fisheye2: { type: 'image', src: 'assets/fisheye2-result.webp' },
        fisheye3: { type: 'image', src: 'assets/fisheye3-result.webp' },
        pinhole: { type: 'image', src: 'assets/pinhole-result.webp' },
      },
      ace: {},
      glace: {},
      dsac: {},
    },
  },
};
