import { Scene } from '../common/game';
import ShaderProgram from '../common/shader-program';
import Mesh from '../common/mesh';
import * as MeshUtils from '../common/mesh-utils';
import Camera from '../common/camera';
import FlyCameraController from '../common/camera-controllers/fly-camera-controller';
import { vec3, mat4 } from 'gl-matrix';
import { Vector, Selector, Color, NumberInput } from '../common/dom-utils';
import { createElement, StatelessProps, StatelessComponent } from 'tsx-create-element';

// In this scene we will draw some monkeys with one spot light
export default class SpotLightScene extends Scene {
    program: ShaderProgram;
    camera: Camera;
    controller: FlyCameraController;
    meshes: {[name: string]: Mesh} = {};

    material = {
        diffuse: vec3.fromValues(0.5,0.3,0.1),
        specular: vec3.fromValues(1,1,1),
        ambient: vec3.fromValues(0.5,0.3,0.1),
        shininess: 20
    };

    light = {
        diffuse: vec3.fromValues(5,5,5),
        specular: vec3.fromValues(5,5,5),
        ambient: vec3.fromValues(1,1,1),
        position: vec3.fromValues(0,1,8),
        direction: vec3.fromValues(0,0,-1),
        attenuation_quadratic: 1,
        attenuation_linear: 0,
        attenuation_constant: 0,
        inner_cone: 0.24*Math.PI,
        outer_cone: 0.25*Math.PI
    };

    public load(): void {
        this.game.loader.load({
            ["vert"]:{url:'shaders/phong/single-light/spot.vert', type:'text'},
            ["frag"]:{url:'shaders/phong/single-light/spot.frag', type:'text'},
            ["suzanne"]:{url:'models/Suzanne/Suzanne.obj', type:'text'},
        });
    } 
    
    public start(): void {
        this.program = new ShaderProgram(this.gl);
        this.program.attach(this.game.loader.resources["vert"], this.gl.VERTEX_SHADER);
        this.program.attach(this.game.loader.resources["frag"], this.gl.FRAGMENT_SHADER);
        this.program.link();

        this.meshes['ground'] = MeshUtils.Plane(this.gl, {min:[0,0], max:[100,100]});
        this.meshes['suzanne'] = MeshUtils.LoadOBJMesh(this.gl, this.game.loader.resources["suzanne"]);

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

        this.gl.disable(this.gl.BLEND);

        this.gl.clearColor(0.1,0.1,0.1,1);

        this.setupControls();
    }
    
    public draw(deltaTime: number): void {
        this.controller.update(deltaTime);

        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
        
        this.program.use();

        this.program.setUniformMatrix4fv("VP", false, this.camera.ViewProjectionMatrix);
        this.program.setUniform3f("cam_position", this.camera.position);
        
        this.program.setUniform3f("light.diffuse", this.light.diffuse);
        this.program.setUniform3f("light.specular", this.light.specular);
        this.program.setUniform3f("light.ambient", this.light.ambient);
        this.program.setUniform3f("light.position", this.light.position);
        this.program.setUniform3f("light.direction", vec3.normalize(vec3.create(), this.light.direction));
        this.program.setUniform1f("light.attenuation_quadratic", this.light.attenuation_quadratic);
        this.program.setUniform1f("light.attenuation_linear", this.light.attenuation_linear);
        this.program.setUniform1f("light.attenuation_constant", this.light.attenuation_constant);
        this.program.setUniform1f("light.inner_cone", this.light.inner_cone);
        this.program.setUniform1f("light.outer_cone", this.light.outer_cone);

        let groundM = mat4.create();
        mat4.scale(groundM, groundM, [100, 1, 100]);

        this.program.setUniformMatrix4fv("M", false, groundM);
        this.program.setUniformMatrix4fv("M_it", true, mat4.invert(mat4.create(), groundM));
        this.program.setUniform3f("material.diffuse", [0.5,0.5,0.5]);
        this.program.setUniform3f("material.specular", [0.2,0.2,0.2]);
        this.program.setUniform3f("material.ambient", [0.1,0.1,0.1]);
        this.program.setUniform1f("material.shininess", 2);

        this.meshes['ground'].draw(this.gl.TRIANGLES);

        for(let i = -1; i <= 1; i++){
            for(let j = -1; j <= 1; j++){
                let M = mat4.create();
                mat4.translate(M, M, [i*4, 1, j*4]);
        
                this.program.setUniformMatrix4fv("M", false, M);
                this.program.setUniformMatrix4fv("M_it", true, mat4.invert(mat4.create(), M));
                this.program.setUniform3f("material.diffuse", this.material.diffuse);
                this.program.setUniform3f("material.specular", this.material.specular);
                this.program.setUniform3f("material.ambient", this.material.ambient);
                this.program.setUniform1f("material.shininess", this.material.shininess);
        
                this.meshes['suzanne'].draw(this.gl.TRIANGLES);
            }
        }


    }
    
    public end(): void {
        this.program.dispose();
        this.program = null;
        for(let key in this.meshes)
            this.meshes[key].dispose();
        this.meshes = {};
        this.clearControls();
    }


    /////////////////////////////////////////////////////////
    ////// ADD CONTROL TO THE WEBPAGE (NOT IMPORTNANT) //////
    /////////////////////////////////////////////////////////
    private setupControls() {
        const controls = document.querySelector('#controls');
        
        

        controls.appendChild(
            <div>
                <div className="control-row">
                    <label className="control-label">Material Diffuse</label>
                    <Color color={this.material.diffuse}/>
                </div>
                <div className="control-row">
                    <label className="control-label">Material Specular</label>
                    <Color color={this.material.specular}/>
                </div>
                <div className="control-row">
                    <label className="control-label">Material Ambient</label>
                    <Color color={this.material.ambient}/>
                </div>
                <div className="control-row">
                    <label className="control-label">Material Shininess</label>
                    <NumberInput value={this.material.shininess} onchange={(v)=>{this.material.shininess=v;}}/>
                </div>
                <div className="control-row">
                    <label className="control-label">Light Diffuse</label>
                    <Color color={this.light.diffuse}/>
                </div>
                <div className="control-row">
                    <label className="control-label">Light Specular</label>
                    <Color color={this.light.specular}/>
                </div>
                <div className="control-row">
                    <label className="control-label">Light Ambient</label>
                    <Color color={this.light.ambient}/>
                </div>
                <div className="control-row">
                    <label className="control-label">Light Position</label>
                    <Vector vector={this.light.position}/>
                </div>
                <div className="control-row">
                    <label className="control-label">Light Direction</label>
                    <Vector vector={this.light.direction}/>
                </div>
                <div className="control-row">
                    <label className="control-label">Light Attenuation</label>
                    <label className="control-label">D^2</label>
                    <NumberInput value={this.light.attenuation_quadratic} onchange={(v)=>{this.light.attenuation_quadratic=v;}}/>
                    <label className="control-label">D^1</label>
                    <NumberInput value={this.light.attenuation_linear} onchange={(v)=>{this.light.attenuation_linear=v;}}/>
                    <label className="control-label">D^0</label>
                    <NumberInput value={this.light.attenuation_constant} onchange={(v)=>{this.light.attenuation_constant=v;}}/>
                </div>
                <div className="control-row">
                    <label className="control-label">Light cone</label>
                    <label className="control-label">inner</label>
                    <NumberInput value={this.light.inner_cone} onchange={(v)=>{this.light.inner_cone=v;}}/>
                    <label className="control-label">Outer</label>
                    <NumberInput value={this.light.outer_cone} onchange={(v)=>{this.light.outer_cone=v;}}/>
                </div>
            </div>
            
        );
        
    }

    private clearControls() {
        const controls = document.querySelector('#controls');
        controls.innerHTML = "";
    }


}