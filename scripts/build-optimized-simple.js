#!/usr/bin/env node

/**
 * Build Script for Optimized PisoWiFi Portal Components
 * Creates lightweight bundles for old devices
 */

const { build } = require('esbuild');
const fs = require('fs');

// Build only the optimized components
const configs = [
  {
    name: 'Optimized Portal Components',
    entryPoints: [
      'components/Portal/LandingPageOptimized.tsx',
      'components/Portal/CoinModalOptimized.tsx'
    ],
    bundle: true,
    splitting: true,
    outdir: 'dist/optimized',
    format: 'esm',
    target: 'es2015',
    minify: true,
    sourcemap: false,
    loader: { '.tsx': 'tsx', '.ts': 'ts' },
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    external: ['react', 'react-dom', 'socket.io-client', 'recharts', 'lucide-react']
  },
  {
    name: 'Optimized Entry Bundle',
    entry: 'index-optimized.tsx',
    outfile: 'dist/bundle-optimized.js',
    format: 'iife',
    target: 'es2015',
    minify: true,
    sourcemap: false,
    loader: { '.tsx': 'tsx', '.ts': 'ts' },
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    external: ['socket.io-client', 'recharts', 'lucide-react']
  }
];

async function buildOptimized() {
  console.log('🚀 Building optimized portal components...');
  
  // Create dist directory if it doesn't exist
  if (!fs.existsSync('dist')) {
    fs.mkdirSync('dist', { recursive: true });
  }
  
  for (const config of configs) {
    console.log(`\n📦 Building ${config.name}...`);
    
    try {
      await build({
        entryPoints: config.entryPoints || [config.entry],
        bundle: config.bundle !== false,
        outfile: config.outfile,
        outdir: config.outdir,
        splitting: config.splitting,
        format: config.format,
        target: config.target,
        minify: config.minify,
        sourcemap: config.sourcemap,
        loader: config.loader,
        jsx: config.jsx,
        define: config.define,
        external: config.external || [],
        logLevel: 'info'
      });
      
      // Get file size if single output
      if (config.outfile && fs.existsSync(config.outfile)) {
        const stats = fs.statSync(config.outfile);
        const sizeKB = (stats.size / 1024).toFixed(1);
        console.log(`✅ ${config.name} completed: ${sizeKB}KB`);
        console.log(`📁 Output: ${config.outfile}`);
      } else if (config.outdir) {
        console.log(`✅ ${config.name} completed in: ${config.outdir}`);
      }
      
    } catch (error) {
      console.error(`❌ ${config.name} failed:`, error.message);
      // Continue with other builds even if one fails
      continue;
    }
  }
  
  console.log('\n🎉 Optimized build process completed!');
  
  // Create build info
  const buildInfo = {
    timestamp: new Date().toISOString(),
    builds: []
  };
  
  // Check if files were created
  if (fs.existsSync('dist/bundle-optimized.js')) {
    const stats = fs.statSync('dist/bundle-optimized.js');
    buildInfo.builds.push({
      name: 'Optimized Bundle',
      file: 'dist/bundle-optimized.js',
      size: stats.size,
      sizeKB: (stats.size / 1024).toFixed(1)
    });
  }
  
  if (buildInfo.builds.length > 0) {
    fs.writeFileSync('dist/build-info.json', JSON.stringify(buildInfo, null, 2));
    console.log('\n📋 Build info saved to: dist/build-info.json');
  }
}

// Run the build
buildOptimized().catch(error => {
  console.error('Build process failed:', error);
  process.exit(1);
});