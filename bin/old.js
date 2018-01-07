const fs = require( 'fs' );
const path = require( 'path' );
const jscodeshift = require( 'jscodeshift' );


const PROJECT_DIR = path.resolve( path.join( __dirname, '..', '..', 'wp-calypso' ) );
const CLIENT_DIR = path.resolve( path.join( PROJECT_DIR, 'client', 'login' ) );

// from: http://stackoverflow.com/questions/5827612/node-js-fs-readdir-recursive-directory-search
function walk( dir, done ) {
	let results = [];

	fs.readdir( dir, ( err, list ) => {
		if ( err ) {
			return done( err );
		}

		let pending = list.length;

		if ( ! pending ) {
			return done( null, results );
		}

		list.forEach( ( file ) => {
			file = path.resolve( dir, file );
			fs.stat(file, ( err, stat ) => {
				if ( err ) {
					return done( err );
				}

				if ( stat && stat.isDirectory() ) {
					walk( file, ( err, res ) => {
						results = results.concat( res );
						if ( ! --pending ) done( null, results );
					} );
				} else {
					results.push( file );
					if ( ! --pending ) done( null, results );
				}
			} );
		} );
	} );
}


function getImports( filename, scssFilenames ) {
	const src = fs.readFileSync( filename ).toString( 'utf-8' );

	let modified = false;
	let root = jscodeshift( src );
	let dependencies = [];

	// import ...
	const importSrc = root
		.find( jscodeshift.ImportDeclaration )
		.forEach( importDeclaration => dependencies.push( importDeclaration.value.source.value ) );

	// = require( 'dependency' );
	const requireSrc = root
		.find( jscodeshift.CallExpression, { callee: { name: 'require' } } )
		.forEach( callExpression => dependencies.push( callExpression.value.arguments[ 0 ].value ) );

	return dependencies;
};


function getDependencies( filepath ) {
	return new Promise( ( resolve, reject ) => {
		walk(
			filepath,
			( err, results ) => {
				if ( err ) {
					return reject( err );
				}

				const dependencies = Array.prototype.concat.apply( 
					[],
					results
						.filter( filename => filename.match( /\.jsx?$/ ) )
						.map( getImports )
					);

				const nodeModules = new Set();
				const calypsoModules = new Set();

				const modulesToProcess = [];
				[ ...new Set( dependencies ) ] // uniques only
					.filter( dep => dep.indexOf( '.' ) != 0 ) // relative ../bla.js or ./bla.js
					.forEach( dep => {
						const firstPart = dep.split( '/' )[ 0 ];

						const isNodeModule = fs.existsSync( path.join( PROJECT_DIR, "node_modules", firstPart ) );

						if ( isNodeModule ) {
							nodeModules.add( dep );
						} else {
							calypsoModules.add( dep );
						}
					} );

				resolve( {
					calypsoModules,
					nodeModules,
				} );
			}
		)
	} );

}


async function traverse() {

	const modulesToProcess = [ CLIENT_DIR ];
	let nodeModules = new Set();
	let calypsoModules = new Set();
	
	while ( modulesToProcess.length > 0 ) {
		const result = await getDependencies( modulesToProcess.pop() );

		[ ...result.calypsoModules ]
			.filter( mod => ! calypsoModules.has( mod ) )
			.forEach( mod => {
				const modulePath = path.join( PROJECT_DIR, 'client', mod );

				if ( ! fs.existsSync( mod ) ) {
					modulesToProcess.push(  );					
				}

				modulesToProcess.push(  );
			} );

		calypsoModules = new Set( [ ...calypsoModules, ...result.calypsoModules ] );
		nodeModules = new Set( [ ...nodeModules, ...result.nodeModules ] );
	}

	console.log( 'calypsoModules', calypsoModules );
	console.log( 'nodeModules', nodeModules );
}

traverse();

// walk(
// 	CLIENT_DIR,
// 	( err, results ) => {
// 		const dependencies = Array.prototype.concat.apply( 
// 			[],
// 			results
// 				.filter( filename => filename.match( /\.jsx?$/ ) )
// 				.map( getImports )
// 			);

// 		const nodeModules = new Set();
// 		const calypsoModules = new Set();

// 		const modulesToProcess = [];
// 		[ ...new Set( dependencies ) ] // uniques only
// 			.filter( dep => dep.indexOf( '.' ) != 0 ) // relative ../bla.js or ./bla.js
// 			.forEach( dep => {
// 				const firstPart = dep.split( '/' )[ 0 ];

// 				const isNodeModule = fs.existsSync( path.join( PROJECT_DIR, "node_modules", firstPart ) );

// 				if ( isNodeModule ) {
// 					nodeModules.add( dep );
// 				} else {
// 					if ( calypsoModules.has( dep ) ) {
// 						modulesToProcess.push( dep );
// 						calypsoModules.add( dep );
// 					}
// 				}
// 			} );

// 	}
// );
