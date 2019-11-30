import ShaderProgram from "./shader-program";

export class Material {
    private shader: ShaderProgram;

    private properties: {[name:string]: {value:any, fn:(mat:Material, name:string, value:any)=>void}} = {};
    private current_unit: number;

    

    constructor(shader: ShaderProgram){
        this.shader = shader;
    }

    public get Shader(){ return this.shader; }
    public set Shader(shader: ShaderProgram){ this.shader = shader; }

    private static setUniform1f(mat: Material, name:string, value:number){ mat.shader.setUniform1f(name, value); }
    public setUniform1f(name: string, x: number) {this.properties[name] = {value:x, fn:Material.setUniform1f};}

    private static setUniform1fv(mat: Material, name:string, value:[Float32Array | ArrayLike<number>, number|undefined, number|undefined]){ mat.shader.setUniform1fv(name, value[0], value[1], value[2]); }
    public setUniform1fv(name: string, data: Float32Array | ArrayLike<number>, srcOffset?: number, srcLength?: number) {this.properties[name] = {value:[data,srcOffset,srcLength], fn:Material.setUniform1fv};}

    private static setUniform1i(mat: Material, name:string, value:number){ mat.shader.setUniform1i(name, value); }
    public setUniform1i(name: string, x: number) {this.properties[name] = {value:x, fn:Material.setUniform1i};}

    private static setUniform1iv(mat: Material, name:string, value:[Int32Array | ArrayLike<number>, number|undefined, number|undefined]){ mat.shader.setUniform1iv(name, value[0], value[1], value[2]); }
    public setUniform1iv(name: string, data: Int32Array | ArrayLike<number>, srcOffset?: number, srcLength?: number) {this.properties[name] = {value:[data,srcOffset,srcLength], fn:Material.setUniform1iv};}

    private static setUniform1ui(mat: Material, name:string, value:number){ mat.shader.setUniform1ui(name, value); }
    public setUniform1ui(name: string, x: number) {this.properties[name] = {value:x, fn:Material.setUniform1ui};}

    private static setUniform1uiv(mat: Material, name:string, value:[Uint32Array | ArrayLike<number>, number|undefined, number|undefined]){ mat.shader.setUniform1uiv(name, value[0], value[1], value[2]); }
    public setUniform1uiv(name: string, data: Uint32Array | ArrayLike<number>, srcOffset?: number, srcLength?: number) {this.properties[name] = {value:[data,srcOffset,srcLength], fn:Material.setUniform1uiv};}

    // Two Component Setters

    private static setUniform2f(mat: Material, name:string, value:Float32Array | ArrayLike<number>){ mat.shader.setUniform2f(name, value); }
    public setUniform2f(name: string, v: Float32Array | ArrayLike<number>) {this.properties[name] = {value:v, fn:Material.setUniform2f};}

    private static setUniform2fv(mat: Material, name:string, value:[Float32Array | ArrayLike<number>, number|undefined, number|undefined]){ mat.shader.setUniform2fv(name, value[0], value[1], value[2]); }
    public setUniform2fv(name: string, data: Float32Array | ArrayLike<number>, srcOffset?: number, srcLength?: number) {this.properties[name] = {value:[data,srcOffset,srcLength], fn:Material.setUniform2fv};}

    private static setUniform2i(mat: Material, name:string, value:Int32Array | ArrayLike<number>){ mat.shader.setUniform2i(name, value); }
    public setUniform2i(name: string, v: Int32Array | ArrayLike<number>) {this.properties[name] = {value:v, fn:Material.setUniform2i};}

    private static setUniform2iv(mat: Material, name:string, value:[Int32Array | ArrayLike<number>, number|undefined, number|undefined]){ mat.shader.setUniform2iv(name, value[0], value[1], value[2]); }
    public setUniform2iv(name: string, data: Int32Array | ArrayLike<number>, srcOffset?: number, srcLength?: number) {this.properties[name] = {value:[data,srcOffset,srcLength], fn:Material.setUniform2iv};}

    private static setUniform2ui(mat: Material, name:string, value:Uint32Array | ArrayLike<number>){ mat.shader.setUniform2ui(name, value); }
    public setUniform2ui(name: string, v: Uint32Array | ArrayLike<number>) {this.properties[name] = {value:v, fn:Material.setUniform2ui};}

    private static setUniform2uiv(mat: Material, name:string, value:[Uint32Array | ArrayLike<number>, number|undefined, number|undefined]){ mat.shader.setUniform2uiv(name, value[0], value[1], value[2]); }
    public setUniform2uiv(name: string, data: Uint32Array | ArrayLike<number>, srcOffset?: number, srcLength?: number) {this.properties[name] = {value:[data,srcOffset,srcLength], fn:Material.setUniform2uiv};}

    // Three Component Setters

    private static setUniform3f(mat: Material, name:string, value:Float32Array | ArrayLike<number>){ mat.shader.setUniform3f(name, value); }
    public setUniform3f(name: string, v: Float32Array | ArrayLike<number>) {this.properties[name] = {value:v, fn:Material.setUniform3f};}

    private static setUniform3fv(mat: Material, name:string, value:[Float32Array | ArrayLike<number>, number|undefined, number|undefined]){ mat.shader.setUniform3fv(name, value[0], value[1], value[2]); }
    public setUniform3fv(name: string, data: Float32Array | ArrayLike<number>, srcOffset?: number, srcLength?: number) {this.properties[name] = {value:[data,srcOffset,srcLength], fn:Material.setUniform3fv};}

    private static setUniform3i(mat: Material, name:string, value:Int32Array | ArrayLike<number>){ mat.shader.setUniform3i(name, value); }
    public setUniform3i(name: string, v: Int32Array | ArrayLike<number>) {this.properties[name] = {value:v, fn:Material.setUniform3i};}

    private static setUniform3iv(mat: Material, name:string, value:[Int32Array | ArrayLike<number>, number|undefined, number|undefined]){ mat.shader.setUniform3iv(name, value[0], value[1], value[2]); }
    public setUniform3iv(name: string, data: Int32Array | ArrayLike<number>, srcOffset?: number, srcLength?: number) {this.properties[name] = {value:[data,srcOffset,srcLength], fn:Material.setUniform3iv};}

    private static setUniform3ui(mat: Material, name:string, value:Uint32Array | ArrayLike<number>){ mat.shader.setUniform3ui(name, value); }
    public setUniform3ui(name: string, v: Uint32Array | ArrayLike<number>) {this.properties[name] = {value:v, fn:Material.setUniform3ui};}

    private static setUniform3uiv(mat: Material, name:string, value:[Uint32Array | ArrayLike<number>, number|undefined, number|undefined]){ mat.shader.setUniform3uiv(name, value[0], value[1], value[2]); }
    public setUniform3uiv(name: string, data: Uint32Array | ArrayLike<number>, srcOffset?: number, srcLength?: number) {this.properties[name] = {value:[data,srcOffset,srcLength], fn:Material.setUniform3uiv};}

    // four Component Setters

    private static setUniform4f(mat: Material, name:string, value:Float32Array | ArrayLike<number>){ mat.shader.setUniform4f(name, value); }
    public setUniform4f(name: string, v: Float32Array | ArrayLike<number>) {this.properties[name] = {value:v, fn:Material.setUniform4f};}

    private static setUniform4fv(mat: Material, name:string, value:[Float32Array | ArrayLike<number>, number|undefined, number|undefined]){ mat.shader.setUniform4fv(name, value[0], value[1], value[2]); }
    public setUniform4fv(name: string, data: Float32Array | ArrayLike<number>, srcOffset?: number, srcLength?: number) {this.properties[name] = {value:[data,srcOffset,srcLength], fn:Material.setUniform4fv};}

    private static setUniform4i(mat: Material, name:string, value:Int32Array | ArrayLike<number>){ mat.shader.setUniform4i(name, value); }
    public setUniform4i(name: string, v: Int32Array | ArrayLike<number>) {this.properties[name] = {value:v, fn:Material.setUniform4i};}

    private static setUniform4iv(mat: Material, name:string, value:[Int32Array | ArrayLike<number>, number|undefined, number|undefined]){ mat.shader.setUniform4iv(name, value[0], value[1], value[2]); }
    public setUniform4iv(name: string, data: Int32Array | ArrayLike<number>, srcOffset?: number, srcLength?: number) {this.properties[name] = {value:[data,srcOffset,srcLength], fn:Material.setUniform4iv};}

    private static setUniform4ui(mat: Material, name:string, value:Uint32Array | ArrayLike<number>){ mat.shader.setUniform4ui(name, value); }
    public setUniform4ui(name: string, v: Uint32Array | ArrayLike<number>) {this.properties[name] = {value:v, fn:Material.setUniform4ui};}

    private static setUniform4uiv(mat: Material, name:string, value:[Uint32Array | ArrayLike<number>, number|undefined, number|undefined]){ mat.shader.setUniform4uiv(name, value[0], value[1], value[2]); }
    public setUniform4uiv(name: string, data: Uint32Array | ArrayLike<number>, srcOffset?: number, srcLength?: number) {this.properties[name] = {value:[data,srcOffset,srcLength], fn:Material.setUniform4uiv};}

    // Matrix Setters

    private static setUniformMatrix2fv(mat: Material, name:string, value:[Float32Array | ArrayLike<number>, number|undefined, number|undefined, boolean]){ mat.shader.setUniformMatrix2fv(name, value[3], value[0], value[1], value[2]); }
    public setUniformMatrix2fv(name: string, transpose: boolean, data: Float32Array | ArrayLike<number>, srcOffset?: number, srcLength?: number){this.properties[name] = {value:[data,srcOffset,srcLength,transpose], fn:Material.setUniformMatrix2fv};}

    private static setUniformMatrix2x3fv(mat: Material, name:string, value:[Float32Array | ArrayLike<number>, number|undefined, number|undefined, boolean]){ mat.shader.setUniformMatrix2x3fv(name, value[3], value[0], value[1], value[2]); }
    public setUniformMatrix2x3fv(name: string, transpose: boolean, data: Float32Array | ArrayLike<number>, srcOffset?: number, srcLength?: number){this.properties[name] = {value:[data,srcOffset,srcLength,transpose], fn:Material.setUniformMatrix2x3fv};}

    private static setUniformMatrix2x4fv(mat: Material, name:string, value:[Float32Array | ArrayLike<number>, number|undefined, number|undefined, boolean]){ mat.shader.setUniformMatrix2x4fv(name, value[3], value[0], value[1], value[2]); }
    public setUniformMatrix2x4fv(name: string, transpose: boolean, data: Float32Array | ArrayLike<number>, srcOffset?: number, srcLength?: number){this.properties[name] = {value:[data,srcOffset,srcLength,transpose], fn:Material.setUniformMatrix2x4fv};}

    private static setUniformMatrix3fv(mat: Material, name:string, value:[Float32Array | ArrayLike<number>, number|undefined, number|undefined, boolean]){ mat.shader.setUniformMatrix3fv(name, value[3], value[0], value[1], value[2]); }
    public setUniformMatrix3fv(name: string, transpose: boolean, data: Float32Array | ArrayLike<number>, srcOffset?: number, srcLength?: number){this.properties[name] = {value:[data,srcOffset,srcLength,transpose], fn:Material.setUniformMatrix3fv};}

    private static setUniformMatrix3x2fv(mat: Material, name:string, value:[Float32Array | ArrayLike<number>, number|undefined, number|undefined, boolean]){ mat.shader.setUniformMatrix3x2fv(name, value[3], value[0], value[1], value[2]); }
    public setUniformMatrix3x2fv(name: string, transpose: boolean, data: Float32Array | ArrayLike<number>, srcOffset?: number, srcLength?: number){this.properties[name] = {value:[data,srcOffset,srcLength,transpose], fn:Material.setUniformMatrix3x2fv};}

    private static setUniformMatrix3x4fv(mat: Material, name:string, value:[Float32Array | ArrayLike<number>, number|undefined, number|undefined, boolean]){ mat.shader.setUniformMatrix3x4fv(name, value[3], value[0], value[1], value[2]); }
    public setUniformMatrix3x4fv(name: string, transpose: boolean, data: Float32Array | ArrayLike<number>, srcOffset?: number, srcLength?: number){this.properties[name] = {value:[data,srcOffset,srcLength,transpose], fn:Material.setUniformMatrix3x4fv};}

    private static setUniformMatrix4fv(mat: Material, name:string, value:[Float32Array | ArrayLike<number>, number|undefined, number|undefined, boolean]){ mat.shader.setUniformMatrix4fv(name, value[3], value[0], value[1], value[2]); }
    public setUniformMatrix4fv(name: string, transpose: boolean, data: Float32Array | ArrayLike<number>, srcOffset?: number, srcLength?: number){this.properties[name] = {value:[data,srcOffset,srcLength,transpose], fn:Material.setUniformMatrix4fv};}

    private static setUniformMatrix4x2fv(mat: Material, name:string, value:[Float32Array | ArrayLike<number>, number|undefined, number|undefined, boolean]){ mat.shader.setUniformMatrix4x2fv(name, value[3], value[0], value[1], value[2]); }
    public setUniformMatrix4x2fv(name: string, transpose: boolean, data: Float32Array | ArrayLike<number>, srcOffset?: number, srcLength?: number){this.properties[name] = {value:[data,srcOffset,srcLength,transpose], fn:Material.setUniformMatrix4x2fv};}
    
    private static setUniformMatrix4x3fv(mat: Material, name:string, value:[Float32Array | ArrayLike<number>, number|undefined, number|undefined, boolean]){ mat.shader.setUniformMatrix4x3fv(name, value[3], value[0], value[1], value[2]); }
    public setUniformMatrix4x3fv(name: string, transpose: boolean, data: Float32Array | ArrayLike<number>, srcOffset?: number, srcLength?: number){this.properties[name] = {value:[data,srcOffset,srcLength,transpose], fn:Material.setUniformMatrix4x3fv};}

    private static setTexture(mat: Material, name:string, value:[number, WebGLTexture, WebGLSampler?]){ mat.shader.setTexture(name, mat.current_unit++, value[0], value[1], value[2]); }
    public setTexture(name: string, target: number, texture: WebGLTexture, sampler?: WebGLSampler){this.properties[name] = {value:[target, texture, sampler], fn:Material.setTexture};}

    public use(){
        this.current_unit = 0;
        this.shader.use();
        for(const name in this.properties){
            let { value, fn } = this.properties[name];
            fn(this, name, value);
        }
    }
}