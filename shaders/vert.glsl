#ifdef GL_ES
    precision mediump float;
#endif

attribute vec3 a_position;

uniform mat4 u_view, u_model, u_ortho;

varying vec3 v_position;

void main(){    
	mat4 modelview = u_view * u_model;

    //gl_Position = vec4(a_position, 1.0);
    gl_Position = u_ortho * modelview * vec4(a_position,1.0);
    
    gl_PointSize = 2.0;
    v_position = gl_Position.xyz/gl_Position.w;
}

