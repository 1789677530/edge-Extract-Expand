module.exports = {
  presets: [
    ['@babel/preset-env', { 
      targets: { 
        node: 'current',
        edge: '18'
      },
      useBuiltIns: 'usage',
      corejs: 3
    }]
  ]
}