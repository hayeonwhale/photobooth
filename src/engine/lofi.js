const VS = `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
uniform sampler2D uCam;
uniform vec2 uRes, uCamRes, uFace, uPoint;
uniform float uTime, uWarm, uCool, uOpen, uMood, uPresence, uMirror;
uniform float uPointing;
uniform vec3 uVariant;
out vec4 outColor;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise1(float x) { float i = floor(x), f = fract(x); return mix(hash(vec2(i, 0.0)), hash(vec2(i + 1.0, 0.0)), f * f * (3.0 - 2.0 * f)); }

vec2 coverScale() {
  float sa = uRes.x / uRes.y, ca = uCamRes.x / uCamRes.y;
  return sa > ca ? vec2(1.0, ca / sa) : vec2(sa / ca, 1.0);
}
vec3 cam(vec2 uv) {
  uv = (uv - 0.5) * coverScale() + 0.5;
  if (uMirror > 0.5) uv.x = 1.0 - uv.x;
  return texture(uCam, clamp(uv, 0.001, 0.999)).rgb;
}
const mat3 toYIQ = mat3(0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312);
const mat3 toRGB = mat3(1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703);

void main() {
  vec2 screenUv = gl_FragCoord.xy / uRes;
  vec2 uv = screenUv;
  float lines = 300.0;
  float line = floor(uv.y * lines);
  uv.y = (line + 0.5) / lines;

  float jitter = (noise1(line * 0.35 + uTime * (7.0 + uVariant.z * 5.0)) - 0.5) * (0.0006 + uVariant.x * 0.0007);
  float band = smoothstep(0.035, 0.0, abs(uv.y - fract(uTime * 0.045))) * 0.003;
  uv.x += jitter + band;

  float px = 1.0 / 420.0;
  float y = 0.0;
  for (int i = -2; i <= 2; i++) y += (toYIQ * cam(uv + vec2(float(i) * px, 0.0))).x * (i == 0 ? 0.4 : (abs(i) == 1 ? 0.2 : 0.1));
  vec2 iq = vec2(0.0);
  for (int i = -3; i <= 3; i++) iq += (toYIQ * cam(uv + vec2((float(i) * 2.5 - 3.0) * px, 0.0))).yz;
  iq /= 7.0;

  iq *= 0.55;
  iq += vec2(0.018, -0.012);
  vec3 col = toRGB * vec3(y, iq);
  col = col * 0.88 + 0.055;
  col = pow(clamp(col, 0.0, 1.0), vec3(0.95, 1.0, 1.08));

  float aspect = uRes.x / uRes.y;
  vec2 face = (vec2(uFace.x, 1.0 - uFace.y) - 0.5) / coverScale() + 0.5;
  vec2 d = (gl_FragCoord.xy / uRes - mix(vec2(0.5), face, uPresence)) * vec2(aspect, 1.0);
  float radius = 0.35 + uOpen * 0.75;
  float glow = exp(-dot(d, d) / (radius * radius));
  float ring = exp(-pow((length(d) - radius * 0.9) / (0.12 + uOpen * 0.1), 2.0)) * uOpen;

  vec3 warmLight = vec3(1.0, 0.62, 0.32);
  vec3 coolLight = vec3(0.45, 0.62, 1.0);
  warmLight = mix(warmLight, vec3(1.0, 0.72, 0.42), uVariant.x);
  coolLight = mix(coolLight, vec3(0.38, 0.72, 0.82), uVariant.z);
  vec3 lightCol = mix(mix(vec3(1.0, 0.9, 0.8), warmLight, uWarm), coolLight, uCool * (1.0 - 0.5 * uWarm));
  float strength = 0.08 + uWarm * 0.32 + uOpen * 0.2;
  col = 1.0 - (1.0 - col) * (1.0 - lightCol * (glow * strength + ring * 0.18));
  col *= mix(vec3(1.0), vec3(1.04, 0.97, 0.9), uWarm * 0.6);
  col *= mix(vec3(1.0), vec3(0.72, 0.8, 0.95), uCool * 0.7);
  col *= 0.82 + uMood * 0.34;

  float scan = 0.975 + 0.025 * sin(gl_FragCoord.y * 3.14159 * 0.5);
  col *= scan;
  float grain = hash(gl_FragCoord.xy * 0.73 + fract(uTime * 37.0) * 113.0) - 0.5;
  col += grain * (0.025 + uVariant.b * 0.02);
  vec2 v = gl_FragCoord.xy / uRes - 0.5;
  col *= 1.0 - smoothstep(0.35, 0.85, length(v * vec2(aspect * 0.8, 1.0))) * (0.55 + uCool * 0.25);

  vec2 point = (vec2(uPoint.x, 1.0 - uPoint.y) - 0.5) / coverScale() + 0.5;
  vec2 focusDelta = (screenUv - point) * vec2(aspect, 1.0);
  float focus = 1.0 - smoothstep(0.06, 0.14, length(focusDelta));
  vec3 sharp = cam(screenUv);
  sharp = clamp((sharp - 0.5) * 1.08 + 0.5, 0.0, 1.0);
  col = mix(col, sharp, focus * uPointing);

  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

export function createLofi(canvas) {
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, powerPreference: "high-performance" });
  if (!gl) throw new Error("WebGL2 is not available in this browser");
  const prog = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, FS]]) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    gl.attachShader(prog, s);
  }
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  const u = {};
  for (let i = 0; i < gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS); i++) {
    const n = gl.getActiveUniform(prog, i).name;
    u[n] = gl.getUniformLocation(prog, n);
  }
  gl.bindVertexArray(gl.createVertexArray());
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

  const resize = () => {
    const scale = Math.min(1, 540 / innerHeight);
    canvas.width = Math.round(innerWidth * scale);
    canvas.height = Math.round(innerHeight * scale);
  };
  addEventListener("resize", resize);
  resize();

  const shot = document.createElement("canvas");
  let time = 0;

  return {
    render(video, p, dt, mirror) {
      if (video.readyState < 2) return false;
      time += dt;
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(prog);
      gl.uniform1i(u.uCam, 0);
      gl.uniform2f(u.uRes, canvas.width, canvas.height);
      gl.uniform2f(u.uCamRes, video.videoWidth, video.videoHeight);
      gl.uniform2f(u.uFace, mirror ? 1 - p.faceX : p.faceX, p.faceY);
      gl.uniform2f(u.uPoint, mirror ? 1 - p.pointX : p.pointX, p.pointY);
      gl.uniform1f(u.uMirror, mirror ? 1 : 0);
      gl.uniform1f(u.uTime, time);
      gl.uniform1f(u.uWarm, p.smile);
      gl.uniform1f(u.uCool, p.browDown);
      gl.uniform1f(u.uOpen, p.jawOpen);
      gl.uniform1f(u.uMood, p.mood);
      gl.uniform1f(u.uPresence, p.presence);
      gl.uniform1f(u.uPointing, p.pointing);
      gl.uniform3f(u.uVariant, p.profile.a, p.profile.b, p.profile.c);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      return true;
    },
    capture() {
      const { width: cw, height: ch } = canvas;
      const w = Math.min(cw, (ch * 4) / 3);
      const h = (w * 3) / 4;
      shot.width = 960;
      shot.height = 720;
      const ctx = shot.getContext("2d");
      ctx.drawImage(canvas, (cw - w) / 2, (ch - h) / 2, w, h, 0, 0, shot.width, shot.height);
      const d = new Date();
      const stamp = `'${String(d.getFullYear()).slice(2)}  ${d.getMonth() + 1}  ${d.getDate()}`;
      ctx.font = "44px VT323, monospace";
      ctx.textAlign = "right";
      ctx.textBaseline = "alphabetic";
      ctx.shadowColor = "rgba(255, 120, 30, 0.9)";
      ctx.shadowBlur = 10;
      ctx.fillStyle = "#ff8a2a";
      ctx.globalAlpha = 0.85;
      ctx.fillText(stamp, shot.width - 40, shot.height - 34);
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      return shot.toDataURL("image/jpeg", 0.88);
    },
  };
}
