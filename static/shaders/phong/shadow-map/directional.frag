#version 300 es
precision highp float;
precision highp sampler2DShadow; // The precision of the shadow map sampler

in vec2 v_texcoord;
in vec3 v_world;
in vec3 v_normal;
in vec3 v_view;

out vec4 color;

struct Material {
    sampler2D albedo;
    vec3 albedo_tint;
    sampler2D specular;
    vec3 specular_tint;
    sampler2D roughness;
    float roughness_scale;
    sampler2D ambient_occlusion;
    sampler2D emissive;
    vec3 emissive_tint;
};
uniform Material material;

// We will only support up to 4 cascades
#define MAX_CASCADES 4

struct DirectionalLight {
    vec3 color;
    vec3 direction;
    bool hasShadow;
    sampler2DShadow shadowMaps[MAX_CASCADES];
    mat4 shadowVPs[MAX_CASCADES];
    float cascades[MAX_CASCADES];
    int active_cascades; // The number of active cascades
};
uniform DirectionalLight light;

uniform vec3 cam_position;

float diffuse(vec3 n, vec3 l){
    //Diffuse (Lambert) term computation: reflected light = cosine the light incidence angle on the surface
    //max(0, ..) is used since light shouldn't be negative
    return max(0.0f, dot(n,l));
}

float specular(vec3 n, vec3 l, vec3 v, float shininess){
    //Phong Specular term computation
    return pow(max(0.0f, dot(v,reflect(-l, n))), shininess);
}

struct SampledMaterial {
    vec3 albedo;
    vec3 specular;
    vec3 emissive;
    float shininess;
    float ambient_occlusion;
};

SampledMaterial sampleMaterial(Material material, vec2 texcoord){
    SampledMaterial mat;
    mat.albedo = material.albedo_tint * texture(material.albedo, texcoord).rgb;
    mat.specular = material.specular_tint * texture(material.specular, texcoord).rgb;
    mat.emissive = material.emissive_tint * texture(material.emissive, texcoord).rgb;
    float roughness = material.roughness_scale * texture(material.roughness, texcoord).r;
    mat.shininess = 2.0f/pow(max(0.01f,roughness), 4.0f) - 2.0f;
    mat.ambient_occlusion = texture(material.ambient_occlusion, texcoord).r;
    return mat;
}

void main(){
    SampledMaterial sampled = sampleMaterial(material, v_texcoord);

    vec3 n = normalize(v_normal);
    vec3 v = normalize(v_view);

    float shadow = 1.0f; // If shadow is 1, we are in the light, otherwise, we are in the shadow (I didn't choose the name wisely but I am lazy to change it)
    if(light.hasShadow){ // If this light casts shadows
        int cascade_count = min(light.active_cascades, MAX_CASCADES); // Make sure we don't loop beyond the array size even if the input is incorrect
        for(int i = 0; i < cascade_count; i++){ // for each cascade
            if(distance(cam_position, v_world) <= light.cascades[i]){ // if we are within the cascade range
                vec4 shadowCoord = light.shadowVPs[i] * vec4(v_world, 1.0f); // We calculate the shadow coordinates
                shadowCoord /= shadowCoord.w; // Go from Homogenous clip space to Normalized device coordinates
                shadowCoord = 0.5f * shadowCoord + 0.5f; // change range from [-1, 1] to [0, 1]
                shadow = texture(light.shadowMaps[i], shadowCoord.xyz); // Sample the shadow map (the shadow sampler uses the z of the texture coordinate for depth comparison)
                break; // If we found the cascade then we are done here
            }
        }
    }

    color = vec4(
        (sampled.albedo*diffuse(n, -light.direction) + 
        sampled.specular*specular(n, -light.direction, v, sampled.shininess)) * shadow * light.color, // multiply shadow factor with light
        1.0f
    );
}