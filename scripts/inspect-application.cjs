const {readForm}=require('../src/applications/greenhouse-form.cjs');
const [board,id]=process.argv.slice(2);
readForm(board,id).then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{console.error(error.message.startsWith('JR_')?error.message:'JR_FORM_READ_FAILED');process.exitCode=1;});
