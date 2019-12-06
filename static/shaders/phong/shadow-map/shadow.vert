#version 300 es
layout(location=0) in vec3 position;

uniform mat4 M;
uniform mat4 VP;

void main(){
    gl_Position = VP * M * vec4(position, 1.0f);;
}