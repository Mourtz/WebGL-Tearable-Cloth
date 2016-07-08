#ifdef GL_ES
    precision mediump float;
#endif

uniform vec2 u_resolution;
uniform float u_time;

varying vec3 v_position;

void main()
{
    gl_FragColor = vec4(0.0, 0.8, 0.4, v_position.y);
}
