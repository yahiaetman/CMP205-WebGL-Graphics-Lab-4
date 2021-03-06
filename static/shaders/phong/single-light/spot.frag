#version 300 es
precision highp float;

in vec3 v_world;
in vec3 v_normal;
in vec3 v_view;

out vec4 color;

struct Material {
    vec3 diffuse;
    vec3 specular;
    vec3 ambient;
    float shininess;
};
uniform Material material;

struct SpotLight {
    vec3 diffuse;
    vec3 specular;
    vec3 ambient;
    vec3 position;
    vec3 direction;
    float attenuation_quadratic;
    float attenuation_linear;
    float attenuation_constant;
    float inner_cone;
    float outer_cone;
};
uniform SpotLight light;

float diffuse(vec3 n, vec3 l){
    //Diffuse (Lambert) term computation: reflected light = cosine the light incidence angle on the surface
    //max(0, ..) is used since light shouldn't be negative
    return max(0.0f, dot(n,l));
}

float specular(vec3 n, vec3 l, vec3 v, float shininess){
    //Phong Specular term computation
    return pow(max(0.0f, dot(v,reflect(-l, n))), shininess);
}

void main(){
    vec3 n = normalize(v_normal);
    vec3 v = normalize(v_view);
    vec3 l = light.position - v_world; // Here we need to calculate the light vector
    float d = length(l); // Get the distance between the light and the pixel
    l /= d; // Normalize the light vector
    float angle = acos(dot(-l, light.direction)); // For spot lights, we need to know the angle between the light direction and light vector to get the angular attenuation
    // The attenuation is how much we dim the light as it gets farther
    // Naturally, it should be d^2 but we allow for more artistic control
    float attenuation = light.attenuation_constant +
                        light.attenuation_linear * d +
                        light.attenuation_quadratic * d * d;
    color = vec4(
        material.ambient*light.ambient + 
        (
            material.diffuse*light.diffuse*diffuse(n, l) + 
            material.specular*light.specular*specular(n, l, v, material.shininess)
        )/attenuation*smoothstep(light.outer_cone, light.inner_cone, angle), // We use the smoothstep function to get a nice gradient between the inner and out cone
        1.0f
    );
    //Notice that Attenuation only affects diffuse and specular term
}