/**
 * GLSL for the Zerg creep surface (injected into a MeshStandardMaterial by CreepSystem). Opaque, procedural, no textures.
 *
 * Look targets (from SC2 reference shots):
 *  - zoomed out: near-black charcoal membrane streaked with fine fibres, soft ragged edge where it meets the terrain
 *  - zoomed in : lumpy, wet, cold violet-blue plates separated by dark crevices, with pinpoint glints
 * Detail fades with the pixel footprint (`fp`, tiles per pixel) so far-away creep stays calm instead of shimmering.
 */

export const CREEP_FRAGMENT_COMMON = /* glsl */`
uniform sampler2D tFogMap;
uniform float uMapSize;
uniform float uTime;
float creepRough;
float creepH;

float cHash( vec2 p ) { p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
vec2 cHash2( vec2 p ) { return vec2( cHash( p ), cHash( p + 71.7 ) ); }
float cNoise( vec2 p ) {
  vec2 i = floor( p ), f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( cHash( i ), cHash( i + vec2( 1.0, 0.0 ) ), f.x ), mix( cHash( i + vec2( 0.0, 1.0 ) ), cHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
float cFbm( vec2 p ) {
  float a = 0.5, s = 0.0;
  for ( int i = 0; i < 4; i++ ) { s += a * cNoise( p ); p = p * 2.03 + 17.1; a *= 0.5; }
  return s;
}
// Voronoi: x = distance to nearest cell point, y = to second nearest (y - x ~ 0 on cell borders)
vec2 cVor( vec2 p ) {
  vec2 i = floor( p ), f = fract( p );
  float d1 = 8.0, d2 = 8.0;
  for ( int y = -1; y <= 1; y++ ) for ( int x = -1; x <= 1; x++ ) {
    vec2 g = vec2( float( x ), float( y ) );
    vec2 o = cHash2( i + g );
    float d = length( g + o - f );
    if ( d < d1 ) { d2 = d1; d1 = d; } else if ( d < d2 ) d2 = d;
  }
  return vec2( d1, d2 );
}
`;

/** Replaces <map_fragment>: reads the distance field from `map`, discards outside the ragged edge, and sets diffuseColor opaque. */
export const CREEP_FRAGMENT_COLOR = /* glsl */`
vec2 cp = vMapUv * uMapSize;
float fp = fwidth( cp.x ) + fwidth( cp.y );                 // tiles per pixel: how zoomed in we are
float wMicro = 0.0;                                          // the rocky close-up plates are off: fibres only, at every distance
float wFine = 1.0 - smoothstep( 0.25, 0.9, fp );            // fibre detail weight

// ragged, organic edge: the stored distance field plus low and mid frequency noise
float cSd = ( texture2D( map, vMapUv ).r - 0.5 ) * 4.0;
float cRag = cSd + ( cFbm( cp * 1.3 ) - 0.5 ) * 1.7 + ( cNoise( cp * 5.0 ) - 0.5 ) * 0.4;
if ( cRag < 0.0 ) discard;
float fogB = texture2D( tFogMap, vMapUv ).r;
if ( fogB < 0.05 ) discard;

// surface relief
vec2 vor = cVor( cp * 1.7 );
float crev = smoothstep( 0.0, 0.32, vor.y - vor.x );          // 0 in the crevices between plates, 1 on top
float lump = cFbm( cp * 0.55 );
vec2 cw = cp + ( vec2( cNoise( cp * 0.5 ), cNoise( cp * 0.5 + 9.3 ) ) - 0.5 ) * 0.5; // domain warp, so fibres curve a little
float blend = smoothstep( 0.35, 0.65, cNoise( cp * 0.09 ) );   // fibres flow one way here, another way there
vec2 fqA = vec2( dot( cw, vec2( 0.88, 0.48 ) ), dot( cw, vec2( -0.48, 0.88 ) ) );
vec2 fqB = vec2( dot( cw, vec2( -0.34, 0.94 ) ), dot( cw, vec2( -0.94, -0.34 ) ) );
float fib = mix( cNoise( fqA * vec2( 1.6, 7.0 ) ), cNoise( fqB * vec2( 1.6, 7.0 ) ), blend );
float fib2 = mix( cNoise( fqA * vec2( 3.0, 14.0 ) ), cNoise( fqB * vec2( 3.0, 14.0 ) ), blend );
creepH = 0.45 * lump + wMicro * ( 0.34 * crev + 0.1 * cNoise( cp * 6.0 ) ) + wFine * 0.12 * fib2;

// colour: charcoal base with lighter fibre streaks
vec3 cDark = vec3( 0.010, 0.009, 0.013 );
vec3 cMid = vec3( 0.050, 0.046, 0.058 );
vec3 col = mix( cDark, cMid, smoothstep( 0.22, 0.78, lump ) );
col += vec3( 0.030, 0.028, 0.034 ) * smoothstep( 0.5, 0.95, fib ) * wFine;
col *= 0.75 + 0.5 * fib2 * wFine + 0.25 * ( 1.0 - wFine );
// close up: cold violet-blue plates, dark crevices, a slow glimmer on the ridges
float pulse = 0.5 + 0.5 * sin( uTime * 0.9 + lump * 9.0 );
vec3 cPlate = mix( vec3( 0.030, 0.028, 0.085 ), vec3( 0.150, 0.140, 0.300 ), smoothstep( 0.3, 1.0, crev * ( 0.55 + 0.45 * lump ) ) );
cPlate += vec3( 0.05, 0.05, 0.12 ) * smoothstep( 0.82, 1.0, cNoise( cp * 9.0 ) ) * ( 0.6 + 0.4 * pulse );
col = mix( col, mix( cDark, cPlate, crev ), wMicro * 0.85 );
// edge: darker, slightly violet fringe where the creep thins out onto the ground
float edge = smoothstep( 0.0, 0.9, cRag );
col = mix( col * 0.35 + vec3( 0.012, 0.006, 0.02 ), col, edge );

creepRough = mix( 0.82, 0.38, clamp( crev * wMicro + smoothstep( 0.6, 1.0, lump ) * 0.5, 0.0, 1.0 ) );

vec3 sc2Explored = vec3( 0.38, 0.44, 0.56 );
vec3 fogTint = fogB < 0.42
  ? sc2Explored * smoothstep( 0.0, 0.42, fogB )
  : mix( sc2Explored, vec3( 1.0 ), smoothstep( 0.42, 1.0, fogB ) );
vec4 sampledDiffuseColor = vec4( col * fogTint, 1.0 );
diffuseColor = sampledDiffuseColor;
`;

/** Bump the shading normal by the screen-space gradient of the creep relief (same trick the terrain's cliffs use). */
export const CREEP_FRAGMENT_NORMAL = /* glsl */`
{
  vec3 q0 = dFdx( -vViewPosition ), q1 = dFdy( -vViewPosition );
  vec3 r1 = cross( q1, normal ), r2 = cross( normal, q0 );
  float det = dot( q0, r1 );
  vec2 dH = vec2( dFdx( creepH ), dFdy( creepH ) );
  vec3 grad = sign( det ) * ( dH.x * r1 + dH.y * r2 );
  normal = normalize( abs( det ) * normal - 1.6 * grad );
}
`;
