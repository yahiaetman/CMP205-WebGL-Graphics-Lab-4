#version 300 es
precision highp float;

in vec3 v_world;
in vec3 v_normal;
in vec3 v_view;

struct Material {
    vec3 diffuse;
    vec3 specular;
    vec3 ambient;
    float shininess;
};
uniform Material material;

struct DirectionalLight {
    bool enabled;
    vec3 diffuse;
    vec3 specular;
    vec3 ambient;
    vec3 direction;
};
#define NUM_DIRECTIONAL_LIGHTS 1
uniform DirectionalLight directional_lights[NUM_DIRECTIONAL_LIGHTS];

struct PointLight {
    bool enabled;
    vec3 diffuse;
    vec3 specular;
    vec3 ambient;
    vec3 position;
    float attenuation_quadratic;
    float attenuation_linear;
    float attenuation_constant;
};
#define NUM_POINT_LIGHTS 4
uniform PointLight point_lights[NUM_POINT_LIGHTS];

struct SpotLight {
    bool enabled;
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
#define NUM_SPOT_LIGHTS 4
uniform SpotLight spot_lights[NUM_SPOT_LIGHTS];

out vec4 color;

float diffuse(vec3 n, vec3 l){
    return max(0.0f, dot(n,l));
}

float specular(vec3 n, vec3 l, vec3 v, float shininess){
    return pow(max(0.0f, dot(v,reflect(-l, n))), shininess);
}

vec3 calculate_directional_lights(vec3 n, vec3 v){
    vec3 color = vec3(0,0,0);
    for(int i = 0; i < NUM_DIRECTIONAL_LIGHTS; i++){
        DirectionalLight light = directional_lights[i];
        if(light.enabled){
            vec3 l = -light.direction;
            color += material.ambient*light.ambient + 
                    material.diffuse*light.diffuse*diffuse(n, l) + 
                    material.specular*light.specular*specular(n, l, v, material.shininess);
        }
    }
    return color;
}

vec3 calculate_point_lights(vec3 n, vec3 v){
    vec3 color = vec3(0,0,0);
    for(int i = 0; i < NUM_POINT_LIGHTS; i++){
        PointLight light = point_lights[i];
        if(light.enabled){
            vec3 l = light.position - v_world;
            float d = length(l);
            l /= d;
            float attenuation = light.attenuation_constant +
                                light.attenuation_linear * d +
                                light.attenuation_quadratic * d * d;
            color += material.ambient*light.ambient + 
                (
                    material.diffuse*light.diffuse*diffuse(n, l) + 
                    material.specular*light.specular*specular(n, l, v, material.shininess)
                )/attenuation;
        }
    }
    return color;
}

vec3 calculate_spot_lights(vec3 n, vec3 v){
    vec3 color = vec3(0,0,0);
    for(int i = 0; i < NUM_SPOT_LIGHTS; i++){
        SpotLight light = spot_lights[i];
        if(light.enabled){
            vec3 l = light.position - v_world;
            float d = length(l);
            l /= d;
            float angle = acos(dot(-l, light.direction));
            float attenuation = light.attenuation_constant +
                                light.attenuation_linear * d +
                                light.attenuation_quadratic * d * d;
            color += material.ambient*light.ambient + 
                (
                    material.diffuse*light.diffuse*diffuse(n, l) + 
                    material.specular*light.specular*specular(n, l, v, material.shininess)
                )/attenuation*smoothstep(light.outer_cone, light.inner_cone, angle);
        }
    }
    return color;
}

void main()
{
    vec3 n = normalize(v_normal);
    vec3 v = normalize(v_view);
    color = vec4(
        calculate_directional_lights(n, v) +
        calculate_point_lights(n, v) +
        calculate_spot_lights(n, v),
        1.0f
    );
}