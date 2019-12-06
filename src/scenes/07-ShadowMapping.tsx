import { Scene } from '../common/game';
import ShaderProgram from '../common/shader-program';
import Mesh from '../common/mesh';
import * as MeshUtils from '../common/mesh-utils';
import * as TextureUtils from '../common/texture-utils';
import Camera from '../common/camera';
import FlyCameraController from '../common/camera-controllers/fly-camera-controller';
import { vec3, mat4, quat } from 'gl-matrix';
import { Vector, Selector, Color, NumberInput, CheckBox } from '../common/dom-utils';
import { createElement, StatelessProps, StatelessComponent } from 'tsx-create-element';

interface AmbientLight {
    type: 'ambient',
    enabled: boolean,
    skyColor: vec3,
    groundColor: vec3,
    skyDirection: vec3,
    hasShadow: false
};

interface DirectionalLight {
    type: 'directional',
    enabled: boolean,
    color: vec3,
    direction: vec3
    hasShadow: boolean,
    shadowMaps: WebGLTexture[],
    shadowVPs: mat4[],
    cascades: number[],
    shadowMapSize: number,
    shadowBias: number,
    shadowSlopeBias: number,
    shadowDistance: number
};

interface PointLight {
    type: 'point',
    enabled: boolean,
    color: vec3,
    position: vec3,
    attenuation_quadratic: number,
    attenuation_linear: number,
    attenuation_constant: number,
    hasShadow: boolean,
    shadowMaps: WebGLTexture[],
    shadowVPs: mat4[],
    shadowMapSize: number,
    shadowBias: number,
    shadowSlopeBias: number,
    shadowNear: number,
    shadowFar: number
};

interface SpotLight {
    type: 'spot',
    enabled: boolean,
    color: vec3,
    position: vec3,
    direction: vec3,
    attenuation_quadratic: number,
    attenuation_linear: number,
    attenuation_constant: number,
    inner_cone: number,
    outer_cone: number,
    hasShadow: boolean,
    shadowMaps: WebGLTexture[],
    shadowVPs: mat4[],
    shadowMapSize: number,
    shadowBias: number,
    shadowSlopeBias: number,
    shadowNear: number,
    shadowFar: number
};

type Light = AmbientLight | DirectionalLight | PointLight | SpotLight;

interface Material {
    albedo: WebGLTexture,
    albedo_tint: vec3,
    specular: WebGLTexture,
    specular_tint: vec3
    roughness: WebGLTexture,
    roughness_scale: number,
    ambient_occlusion: WebGLTexture,
    emissive: WebGLTexture,
    emissive_tint: vec3
};

interface Object3D {
    mesh: Mesh,
    material: Material,
    modelMatrix: mat4
};

function perpendicular(directon: vec3): vec3 {
    return vec3.cross(vec3.create(), directon, directon[1] == 0 && directon[2] == 0 ? [0, 0, 1] : [1, 0, 0]);
}

// In this scene we will draw some monkeys with multiple lights using blending and multiple shaders
export default class ShadowMappingScene extends Scene {
    programs: {[name: string]: ShaderProgram} = {};
    camera: Camera;
    controller: FlyCameraController;
    meshes: {[name: string]: Mesh} = {};
    textures: {[name: string]: WebGLTexture} = {};
    samplers: {[name: string]: WebGLSampler} = {};
    frameBuffer: WebGLFramebuffer;

    lights: Light[] = [
        { type: "ambient", enabled: true, skyColor: vec3.fromValues(0.2, 0.3, 0.4), groundColor: vec3.fromValues(0.1, 0.1, 0.1), skyDirection: vec3.fromValues(0,1,0), hasShadow: false},
        { type: 'directional', enabled: true, color: vec3.fromValues(0.5,0.5,0.5), direction:vec3.fromValues(-1,-1,-1), hasShadow: true, shadowMaps:[], shadowVPs: [], cascades: [10, 100], shadowMapSize: 1024, shadowBias: 1, shadowSlopeBias: 1.5, shadowDistance: 800 },
        { type: 'point', enabled: true, color: vec3.fromValues(10,0,0), position:vec3.fromValues(0,2.5,0), attenuation_quadratic:0, attenuation_linear:1, attenuation_constant:0, hasShadow: true, shadowMaps:[], shadowVPs: [], shadowMapSize: 256, shadowBias: 1, shadowSlopeBias: 1.5, shadowNear: 0.01, shadowFar: 100 },
        { type: 'spot', enabled: true, color: vec3.fromValues(5,4,1), position:vec3.fromValues(-2,4,6), direction:vec3.fromValues(0,-1,-1), attenuation_quadratic:0, attenuation_linear:1, attenuation_constant:0, inner_cone: 0.25*Math.PI, outer_cone: 0.3*Math.PI, hasShadow: true, shadowMaps:[], shadowVPs: [], shadowMapSize: 512, shadowBias: 1, shadowSlopeBias: 1.5, shadowNear: 0.01, shadowFar: 100 },
    ];

    objects: {[name: string]: Object3D} = {};

    static readonly CASCADES = [20, 100];

    static readonly PointShadowDirections = [
        [-1,  0,  0],
        [ 0, -1,  0],
        [ 0,  0, -1],
        [ 1,  0,  0],
        [ 0,  1,  0],
        [ 0,  0,  1]
    ];

    static readonly PointShadowUps = [
        [ 0, -1,  0],
        [ 0,  0, -1],
        [ 0, -1,  0],
        [ 0, -1,  0],
        [ 0,  0, -1],
        [ 0, -1,  0]
    ];

    public load(): void {
        this.game.loader.load({
            ["light.vert"]:{url:'shaders/phong/shadow-map/light.vert', type:'text'},
            ["ambient.frag"]:{url:'shaders/phong/shadow-map/ambient.frag', type:'text'},
            ["directional.frag"]:{url:'shaders/phong/shadow-map/directional.frag', type:'text'},
            ["point.frag"]:{url:'shaders/phong/shadow-map/point.frag', type:'text'},
            ["spot.frag"]:{url:'shaders/phong/shadow-map/spot.frag', type:'text'},
            ["shadow.vert"]:{url:'shaders/phong/shadow-map/shadow.vert', type:'text'},
            ["shadow.frag"]:{url:'shaders/phong/shadow-map/shadow.frag', type:'text'},
            ["suzanne"]:{url:'models/Suzanne/Suzanne.obj', type:'text'},
            ["house"]:{url:'models/House/House.obj', type:'text'},
            ["wood.albedo"]:{url:'images/Wood/albedo.jpg', type:'image'},
            ["wood.roughness"]:{url:'images/Wood/roughness.jpg', type:'image'},
            ["wood.specular"]:{url:'images/Wood/specular.jpg', type:'image'},
            ["suzanne.ao"]:{url:'images/Suzanne/ambient_occlusion.jpg', type:'image'},
            ["house.albedo"]:{url:'models/House/House.jpeg', type:'image'},
        });
    } 
    
    public start(): void {
        for(let type of ['ambient', 'directional', 'point', 'spot']){
            this.programs[type] = new ShaderProgram(this.gl);
            this.programs[type].attach(this.game.loader.resources['light.vert'], this.gl.VERTEX_SHADER);
            this.programs[type].attach(this.game.loader.resources[`${type}.frag`], this.gl.FRAGMENT_SHADER);
            this.programs[type].link();
        }

        this.programs['shadow'] = new ShaderProgram(this.gl);
        this.programs['shadow'].attach(this.game.loader.resources['shadow.vert'], this.gl.VERTEX_SHADER);
        this.programs['shadow'].attach(this.game.loader.resources['shadow.frag'], this.gl.FRAGMENT_SHADER);
        this.programs['shadow'].link();

        this.meshes['ground'] = MeshUtils.Plane(this.gl, {min:[0,0], max:[100,100]});
        this.meshes['suzanne'] = MeshUtils.LoadOBJMesh(this.gl, this.game.loader.resources["suzanne"]);
        this.meshes['house'] = MeshUtils.LoadOBJMesh(this.gl, this.game.loader.resources["house"]);

        this.textures['wood.albedo'] = TextureUtils.LoadImage(this.gl, this.game.loader.resources['wood.albedo']);
        this.textures['wood.roughness'] = TextureUtils.LoadImage(this.gl, this.game.loader.resources['wood.roughness']);
        this.textures['wood.specular'] = TextureUtils.LoadImage(this.gl, this.game.loader.resources['wood.specular']);
        this.textures['suzanne.ao'] = TextureUtils.LoadImage(this.gl, this.game.loader.resources['suzanne.ao']);
        this.textures['house.albedo'] = TextureUtils.LoadImage(this.gl, this.game.loader.resources['house.albedo']);
        this.textures['ground.albedo'] = TextureUtils.CheckerBoard(this.gl, [1024, 1024], [256, 256], [26, 26, 26, 255], [196, 196, 196, 255]);
        this.textures['ground.specular'] = TextureUtils.CheckerBoard(this.gl, [1024, 1024], [256, 256], [255, 255, 255, 255], [64, 64, 64, 255]);
        this.textures['ground.roughness'] = TextureUtils.CheckerBoard(this.gl, [1024, 1024], [256, 256], [52, 52, 52, 255], [245, 245, 245, 255]);
        this.textures['white'] = TextureUtils.SingleColor(this.gl, [255, 255, 255, 255]);
        this.textures['black'] = TextureUtils.SingleColor(this.gl, [0, 0, 0, 255]);
        this.textures['grey'] = TextureUtils.SingleColor(this.gl, [128, 128, 128, 255]);

        this.objects['ground'] = {
            mesh: this.meshes['ground'],
            material: {
                albedo: this.textures['ground.albedo'],
                albedo_tint: vec3.fromValues(1, 1, 1),
                specular: this.textures['ground.specular'],
                specular_tint: vec3.fromValues(1, 1, 1),
                roughness: this.textures['ground.roughness'],
                roughness_scale: 1,
                emissive: this.textures['black'],
                emissive_tint: vec3.fromValues(1, 1, 1),
                ambient_occlusion: this.textures['white']
            },
            modelMatrix: mat4.fromRotationTranslationScale(mat4.create(), quat.create(), vec3.fromValues(0, 0, 0), vec3.fromValues(100, 1, 100))
        };

        this.objects['house'] = {
            mesh: this.meshes['house'],
            material: {
                albedo: this.textures['house.albedo'],
                albedo_tint: vec3.fromValues(1, 1, 1),
                specular: this.textures['black'],
                specular_tint: vec3.fromValues(1, 1, 1),
                roughness: this.textures['grey'],
                roughness_scale: 1,
                emissive: this.textures['black'],
                emissive_tint: vec3.fromValues(1, 1, 1),
                ambient_occlusion: this.textures['white']
            },
            modelMatrix: mat4.fromRotationTranslationScale(mat4.create(), quat.create(), vec3.fromValues(0, 0, 0), vec3.fromValues(1, 1, 1))
        };

        this.objects['wood suzanne'] = {
            mesh: this.meshes['suzanne'],
            material: {
                albedo: this.textures['wood.albedo'],
                albedo_tint: vec3.fromValues(1, 1, 1),
                specular: this.textures['wood.specular'],
                specular_tint: vec3.fromValues(1, 1, 1),
                roughness: this.textures['wood.roughness'],
                roughness_scale: 1,
                emissive: this.textures['black'],
                emissive_tint: vec3.fromValues(1, 1, 1),
                ambient_occlusion: this.textures['suzanne.ao']
            },
            modelMatrix: mat4.fromRotationTranslationScale(mat4.create(), quat.create(), vec3.fromValues(-2, 1, 4), vec3.fromValues(1, 1, 1))
        };

        // Create a regular sampler for textures rendered on the scene objects
        this.samplers['regular'] = this.gl.createSampler();
        this.gl.samplerParameteri(this.samplers['regular'], this.gl.TEXTURE_WRAP_S, this.gl.REPEAT);
        this.gl.samplerParameteri(this.samplers['regular'], this.gl.TEXTURE_WRAP_T, this.gl.REPEAT);
        this.gl.samplerParameteri(this.samplers['regular'], this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
        this.gl.samplerParameteri(this.samplers['regular'], this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR_MIPMAP_LINEAR);

        this.samplers['shadow'] = this.gl.createSampler();
        this.gl.samplerParameteri(this.samplers['shadow'], this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.samplerParameteri(this.samplers['shadow'], this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
        this.gl.samplerParameteri(this.samplers['shadow'], this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
        this.gl.samplerParameteri(this.samplers['shadow'], this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
        this.gl.samplerParameteri(this.samplers['shadow'], this.gl.TEXTURE_COMPARE_FUNC, this.gl.LESS);
        this.gl.samplerParameteri(this.samplers['shadow'], this.gl.TEXTURE_COMPARE_MODE, this.gl.COMPARE_REF_TO_TEXTURE);

        for(let light of this.lights){
            if(!light.hasShadow) continue;
            if(light.type == "spot"){
                light.shadowMaps[0] = TextureUtils.RenderTexture(this.gl, [light.shadowMapSize, light.shadowMapSize], this.gl.DEPTH_COMPONENT32F);
            } else if(light.type == "directional"){
                for(let i = 0; i < ShadowMappingScene.CASCADES.length; i++) light.shadowMaps[i] = TextureUtils.RenderTexture(this.gl, [light.shadowMapSize, light.shadowMapSize], this.gl.DEPTH_COMPONENT32F);
            } else if(light.type == "point"){
                for(let i = 0; i < ShadowMappingScene.PointShadowUps.length; i++) light.shadowMaps[i] = TextureUtils.RenderTexture(this.gl, [light.shadowMapSize, light.shadowMapSize], this.gl.DEPTH_COMPONENT32F);
            }
        }

        this.frameBuffer = this.gl.createFramebuffer();

        this.camera = new Camera();
        this.camera.type = 'perspective';
        this.camera.position = vec3.fromValues(5,5,5);
        this.camera.direction = vec3.fromValues(-1,-1,-1);
        this.camera.aspectRatio = this.gl.drawingBufferWidth/this.gl.drawingBufferHeight;
        
        this.controller = new FlyCameraController(this.camera, this.game.input);
        this.controller.movementSensitivity = 0.01;

        this.gl.enable(this.gl.CULL_FACE);
        this.gl.cullFace(this.gl.BACK);
        this.gl.frontFace(this.gl.CCW);

        this.gl.enable(this.gl.DEPTH_TEST);
        this.gl.depthFunc(this.gl.LEQUAL);

        this.gl.clearColor(0.1,0.1,0.1,1);

        this.setupControls();
    }
    
    public draw(deltaTime: number): void {
        this.controller.update(deltaTime);

        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.frameBuffer);
        let shadowProgram = this.programs['shadow']; 
        shadowProgram.use();
        this.gl.enable(this.gl.POLYGON_OFFSET_FILL);
        for(let light of this.lights){
            if(!light.enabled || !light.hasShadow) continue;
            if(light.type == "spot"){
                light.shadowVPs[0] = mat4.mul(mat4.create(),
                    mat4.perspective(mat4.create(), 2*light.outer_cone, 1, light.shadowNear, light.shadowFar),
                    mat4.lookAt(mat4.create(), light.position, vec3.add(vec3.create(), light.position, light.direction), perpendicular(light.direction)));
            } else if(light.type == "directional"){
                const V = mat4.lookAt(mat4.create(), vec3.scaleAndAdd(vec3.create(), this.camera.position,  light.direction, -light.shadowDistance/2), this.camera.position, perpendicular(light.direction));
                for(let i = 0; i < light.cascades.length; i++) {
                    const size= light.cascades[i];
                    light.shadowVPs[i] = mat4.mul(mat4.create(), 
                        mat4.ortho(mat4.create(), -size, size, -size, size, 0, light.shadowDistance), 
                        V);
                }
            } else if(light.type == "point"){
                const P = mat4.perspective(mat4.create(), Math.PI/2, 1, light.shadowNear, light.shadowFar);
                for(let i = 0; i < ShadowMappingScene.PointShadowUps.length; i++) {
                    light.shadowVPs[i] = mat4.mul(mat4.create(), 
                        P, 
                        mat4.lookAt(mat4.create(), light.position, vec3.add(vec3.create(), light.position, ShadowMappingScene.PointShadowDirections[i]), ShadowMappingScene.PointShadowUps[i]));
                }
            }

            for(let i = 0; i < light.shadowMaps.length; i++){
                this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.DEPTH_ATTACHMENT, this.gl.TEXTURE_2D, light.shadowMaps[i], 0);
                if(this.gl.checkFramebufferStatus(this.gl.FRAMEBUFFER) != this.gl.FRAMEBUFFER_COMPLETE) console.error("FrameBuffer is Incomplete");
                this.gl.viewport(0, 0, light.shadowMapSize, light.shadowMapSize);
                this.gl.clear(this.gl.DEPTH_BUFFER_BIT);
                shadowProgram.setUniformMatrix4fv("VP", false, light.shadowVPs[i]);
                this.gl.polygonOffset(light.shadowSlopeBias, light.shadowBias);
                for(let name in this.objects){
                    let obj = this.objects[name];
                    shadowProgram.setUniformMatrix4fv("M", false, obj.modelMatrix);
                    obj.mesh.draw(this.gl.TRIANGLES);
                }
            }

        }
        this.gl.disable(this.gl.POLYGON_OFFSET_FILL);

        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
        this.gl.viewport(0, 0, this.gl.drawingBufferWidth, this.gl.drawingBufferHeight);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

        let first_light = true;
        
        for(const light of this.lights){
            if(!light.enabled) continue;

            if(first_light){
                this.gl.disable(this.gl.BLEND);
                first_light = false;
            }else{
                this.gl.enable(this.gl.BLEND);
                this.gl.blendEquation(this.gl.FUNC_ADD);
                this.gl.blendFunc(this.gl.ONE, this.gl.ONE);
            }

            let program = this.programs[light.type];
            program.use();

            program.setUniformMatrix4fv("VP", false, this.camera.ViewProjectionMatrix);
            program.setUniform3f("cam_position", this.camera.position);

            if(light.type == 'ambient'){
                program.setUniform3f(`light.skyColor`, light.skyColor);
                program.setUniform3f(`light.groundColor`, light.groundColor);
                program.setUniform3f(`light.skyDirection`, vec3.normalize(vec3.create(), light.skyDirection));
            } else {
                program.setUniform3f(`light.color`, light.color);
                
                if(light.type == 'directional' || light.type == 'spot'){
                    program.setUniform3f(`light.direction`, vec3.normalize(vec3.create(), light.direction));
                }
                if(light.type == 'point' || light.type == 'spot'){
                    program.setUniform3f(`light.position`, light.position);
                    program.setUniform1f(`light.attenuation_quadratic`, light.attenuation_quadratic);
                    program.setUniform1f(`light.attenuation_linear`, light.attenuation_linear);
                    program.setUniform1f(`light.attenuation_constant`, light.attenuation_constant);
                }
                if(light.type == 'spot'){
                    program.setUniform1f(`light.inner_cone`, light.inner_cone);
                    program.setUniform1f(`light.outer_cone`, light.outer_cone);
                }

                program.setUniform1f(`light.hasShadow`, light.hasShadow?1:0);
                if(light.hasShadow){
                    for(let i = 0; i < light.shadowMaps.length; i++){
                        program.setUniformMatrix4fv(`light.shadowVPs[${i}]`, false, light.shadowVPs[i]);
                        this.gl.activeTexture(this.gl.TEXTURE5 + i);
                        this.gl.bindTexture(this.gl.TEXTURE_2D, light.shadowMaps[i]);
                        this.gl.bindSampler(5 + i, this.samplers['shadow']);
                        program.setUniform1i(`light.shadowMaps[${i}]`, 5 + i);
                    }
                    if(light.type == 'directional'){
                        for(let i = 0; i < light.cascades.length; i++){
                            program.setUniform1f(`light.cascades[${i}]`, light.cascades[i]);
                        }
                    }
                }
            }

            for(let name in this.objects){
                let obj = this.objects[name];

                program.setUniformMatrix4fv("M", false, obj.modelMatrix);
                program.setUniformMatrix4fv("M_it", true, mat4.invert(mat4.create(), obj.modelMatrix));
                
                program.setUniform3f("material.albedo_tint", obj.material.albedo_tint);
                program.setUniform3f("material.specular_tint", obj.material.specular_tint);
                program.setUniform3f("material.emissive_tint", obj.material.emissive_tint);
                program.setUniform1f("material.roughness_scale", obj.material.roughness_scale);

                this.gl.activeTexture(this.gl.TEXTURE0);
                this.gl.bindTexture(this.gl.TEXTURE_2D, obj.material.albedo);
                this.gl.bindSampler(0, this.samplers['regular']);
                program.setUniform1i("material.albedo", 0);

                this.gl.activeTexture(this.gl.TEXTURE1);
                this.gl.bindTexture(this.gl.TEXTURE_2D, obj.material.specular);
                this.gl.bindSampler(1, this.samplers['regular']);
                program.setUniform1i("material.specular", 1);

                this.gl.activeTexture(this.gl.TEXTURE2);
                this.gl.bindTexture(this.gl.TEXTURE_2D, obj.material.roughness);
                this.gl.bindSampler(2, this.samplers['regular']);
                program.setUniform1i("material.roughness", 2);

                this.gl.activeTexture(this.gl.TEXTURE3);
                this.gl.bindTexture(this.gl.TEXTURE_2D, obj.material.emissive);
                this.gl.bindSampler(3, this.samplers['regular']);
                program.setUniform1i("material.emissive", 3);

                this.gl.activeTexture(this.gl.TEXTURE4);
                this.gl.bindTexture(this.gl.TEXTURE_2D, obj.material.ambient_occlusion);
                this.gl.bindSampler(4, this.samplers['regular']);
                program.setUniform1i("material.ambient_occlusion", 4);

                obj.mesh.draw(this.gl.TRIANGLES);
            }   
        }
    }
    
    public end(): void {
        for(let key in this.programs)
            this.programs[key].dispose();
        this.programs = {};
        for(let key in this.meshes)
            this.meshes[key].dispose();
        this.meshes = {};
        this.clearControls();
    }


    /////////////////////////////////////////////////////////
    ////// ADD CONTROL TO THE WEBPAGE (NOT IMPORTNANT) //////
    /////////////////////////////////////////////////////////
    controls: HTMLElement[];
    selectedControl: number = 0;

    private setupControls() {
        const controls = document.querySelector('#controls');
        
        this.controls = this.lights.map((light)=>{
            if(light.type == 'ambient'){
                return <div>
                    <div className="control-row">
                        <CheckBox value={light.enabled} onchange={(v)=>{light.enabled=v;}}/>
                        <label className="control-label">Ambient Light</label>
                    </div>
                    <div className="control-row">
                        <label className="control-label">Sky Color</label>
                        <Color color={light.skyColor}/>
                    </div>
                    <div className="control-row">
                        <label className="control-label">Ground Color</label>
                        <Color color={light.groundColor}/>
                    </div>
                    <div className="control-row">
                        <label className="control-label">Sky Direction</label>
                        <Vector vector={light.skyDirection}/>
                    </div>
                </div>
            } else if(light.type == 'directional'){
                return <div>
                    <div className="control-row">
                        <CheckBox value={light.enabled} onchange={(v)=>{light.enabled=v;}}/>
                        <label className="control-label">Directional Light</label>
                    </div>
                    <div className="control-row">
                        <label className="control-label">Color</label>
                        <Color color={light.color}/>
                    </div>
                    <div className="control-row">
                        <label className="control-label">Direction</label>
                        <Vector vector={light.direction}/>
                    </div>
                    <div className="control-row">
                        <CheckBox value={light.hasShadow} onchange={(v)=>{light.hasShadow=v;}}/>
                        <label className="control-label">Shadow Casting</label>
                    </div>
                    <div className="control-row">
                        <label className="control-label">Shadow Distance</label>
                        <NumberInput value={light.shadowDistance} onchange={(v)=>{light.shadowDistance=v;}}/>
                    </div>
                    <div className="control-row">
                        <label className="control-label">Shadow Bias</label>
                        <NumberInput value={light.shadowBias} onchange={(v)=>{light.shadowBias=v;}}/>
                        <label className="control-label">Shadow Slope Bias</label>
                        <NumberInput value={light.shadowSlopeBias} onchange={(v)=>{light.shadowSlopeBias=v;}}/>
                    </div>
                    <div className="control-row">
                        <label className="control-label">Cascades</label>
                        {light.cascades.map((v,i)=>{return <NumberInput value={light.cascades[i]} onchange={(v)=>{light.cascades[i]=v;}}/>})}
                    </div>
                </div>;
            } else if(light.type == 'point'){
                return <div>
                    <div className="control-row">
                        <CheckBox value={light.enabled} onchange={(v)=>{light.enabled=v;}}/>
                        <label className="control-label">Point Light</label>
                    </div>
                    <div className="control-row">
                        <label className="control-label">Color</label>
                        <Color color={light.color}/>
                    </div>
                    <div className="control-row">
                        <label className="control-label">Position</label>
                        <Vector vector={light.position}/>
                    </div>
                    <div className="control-row">
                        <label className="control-label">Attenuation</label>
                        <label className="control-label">D^2</label>
                        <NumberInput value={light.attenuation_quadratic} onchange={(v)=>{light.attenuation_quadratic=v;}}/>
                        <label className="control-label">D^1</label>
                        <NumberInput value={light.attenuation_linear} onchange={(v)=>{light.attenuation_linear=v;}}/>
                        <label className="control-label">D^0</label>
                        <NumberInput value={light.attenuation_constant} onchange={(v)=>{light.attenuation_constant=v;}}/>
                    </div>
                    <div className="control-row">
                        <CheckBox value={light.hasShadow} onchange={(v)=>{light.hasShadow=v;}}/>
                        <label className="control-label">Shadow Casting</label>
                    </div>
                    <div className="control-row">
                        <label className="control-label">Shadow Near</label>
                        <NumberInput value={light.shadowNear} onchange={(v)=>{light.shadowNear=v;}}/>
                        <label className="control-label">Shadow Far</label>
                        <NumberInput value={light.shadowFar} onchange={(v)=>{light.shadowFar=v;}}/>
                    </div>
                    <div className="control-row">
                        <label className="control-label">Shadow Bias</label>
                        <NumberInput value={light.shadowBias} onchange={(v)=>{light.shadowBias=v;}}/>
                        <label className="control-label">Shadow Slope Bias</label>
                        <NumberInput value={light.shadowSlopeBias} onchange={(v)=>{light.shadowSlopeBias=v;}}/>
                    </div>
                </div>;
            } else if(light.type == 'spot'){
                return <div>
                    <div className="control-row">
                        <CheckBox value={light.enabled} onchange={(v)=>{light.enabled=v;}}/>
                        <label className="control-label">Spot Light</label>
                    </div>
                    <div className="control-row">
                        <label className="control-label">Color</label>
                        <Color color={light.color}/>
                    </div>
                    <div className="control-row">
                        <label className="control-label">Position</label>
                        <Vector vector={light.position}/>
                    </div>
                    <div className="control-row">
                        <label className="control-label">Direction</label>
                        <Vector vector={light.direction}/>
                    </div>
                    <div className="control-row">
                        <label className="control-label">Attenuation</label>
                        <label className="control-label">D^2</label>
                        <NumberInput value={light.attenuation_quadratic} onchange={(v)=>{light.attenuation_quadratic=v;}}/>
                        <label className="control-label">D^1</label>
                        <NumberInput value={light.attenuation_linear} onchange={(v)=>{light.attenuation_linear=v;}}/>
                        <label className="control-label">D^0</label>
                        <NumberInput value={light.attenuation_constant} onchange={(v)=>{light.attenuation_constant=v;}}/>
                    </div>
                    <div className="control-row">
                        <label className="control-label">Inner Cone</label>
                        <NumberInput value={light.inner_cone * 180 / Math.PI} onchange={(v)=>{light.inner_cone=v * Math.PI / 180;}}/>
                        <label className="control-label">Outer Cone</label>
                        <NumberInput value={light.outer_cone * 180 / Math.PI} onchange={(v)=>{light.outer_cone=v * Math.PI / 180;}}/>
                    </div>
                    <div className="control-row">
                        <CheckBox value={light.hasShadow} onchange={(v)=>{light.hasShadow=v;}}/>
                        <label className="control-label">Shadow Casting</label>
                    </div>
                    <div className="control-row">
                        <label className="control-label">Shadow Near</label>
                        <NumberInput value={light.shadowNear} onchange={(v)=>{light.shadowNear=v;}}/>
                        <label className="control-label">Shadow Far</label>
                        <NumberInput value={light.shadowFar} onchange={(v)=>{light.shadowFar=v;}}/>
                    </div>
                    <div className="control-row">
                        <label className="control-label">Shadow Bias</label>
                        <NumberInput value={light.shadowBias} onchange={(v)=>{light.shadowBias=v;}}/>
                        <label className="control-label">Shadow Slope Bias</label>
                        <NumberInput value={light.shadowSlopeBias} onchange={(v)=>{light.shadowSlopeBias=v;}}/>
                    </div>
                </div>;
            }
        });

        this.controls.forEach((control, index)=>{ control.setAttribute('style', `display:${index==this.selectedControl?'block':'none'}`)});
        

        controls.appendChild(
            <div>
                <div className="control-row">
                    <label className="control-label">Light</label>
                    <Selector 
                        options={Object.fromEntries(this.controls.map((v,i)=>[i,i.toString()]))} 
                        value={this.selectedControl} 
                        onchange={(v)=>{
                            this.selectedControl = v;
                            this.controls.forEach((control, index)=>{ control.setAttribute('style', `display:${index==this.selectedControl?'block':'none'}`)});
                        }}
                    />
                </div>
                {this.controls}
            </div>
            
        );
        
    }

    private clearControls() {
        const controls = document.querySelector('#controls');
        controls.innerHTML = "";
    }


}