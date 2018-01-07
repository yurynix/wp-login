const fs = require( 'fs' );
const fsExtra = require( 'fs-extra' );
const path = require( 'path' );
const jscodeshift = require( 'jscodeshift' );


const PROJECT_DIR = path.resolve( path.join( __dirname, '..', '..', 'wp-calypso' ) );
const CLIENT_DIR = path.resolve( path.join( PROJECT_DIR, 'client', 'login' ) );
const OUTPUT_DIR = path.resolve( path.join( __dirname, '..', 'little-calypso' ) );

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
	const nodeModules = new Set();
	const calypsoModules = new Set();

	if ( ! filepath.match( /\.jsx?$/ ) ) {
		console.warn( 'Skipping getting dependencies from', filepath );
		return {
			nodeModules,
			calypsoModules
		};
	}

	[ ...new Set( getImports( filepath ) ) ] // uniques only
		.forEach( dep => {
			const firstPart = dep.split( '/' )[ 0 ];

			const isNodeModule = dep.indexOf( '.' ) !== 0 && fs.existsSync( path.join( PROJECT_DIR, "node_modules", firstPart ) );

			if ( isNodeModule ) {
				nodeModules.add( dep );
			} else {
				if ( dep.indexOf( '.' ) === 0 ) {
					const depPath = path.resolve( path.join( path.dirname( filepath ), dep ) ).replace( path.join( PROJECT_DIR, 'client', '/' ), '' );
					calypsoModules.add( depPath );
				} else {
					calypsoModules.add( dep );
				}
			}
		} );

	return {
		calypsoModules,
		nodeModules,
	};
}

function getActualPath( mod ) {
	let modulePath = path.join( PROJECT_DIR, 'client', mod );

	try {
		modulePath = require.resolve( modulePath );
	} catch ( ex ) {
		if ( fs.existsSync( modulePath + '.js' ) ) {
			modulePath += '.js';
		} else if ( fs.existsSync( modulePath + '.jsx' ) ) {
			modulePath += '.jsx';
		} else {
			modulePath += '/index.jsx';
		}
	}

	return modulePath;
}


function traverse() {

	const modulesToProcess = [ require.resolve( CLIENT_DIR ) ];
	let nodeModules = new Set();
	let calypsoModules = new Set();
	let i = 0;
	while ( modulesToProcess.length > 0 ) {
		const result = getDependencies( modulesToProcess.pop() );

		[ ...result.calypsoModules ]
			.filter( mod => ! calypsoModules.has( mod ) )
			.forEach( mod => {
				let modulePath = getActualPath( mod );

				if ( ! fs.existsSync( modulePath ) ) {
				 	console.warn( 'Cant resolve', mod, modulePath );
				 	return;
				}

				modulesToProcess.push( modulePath );

				if ( modulePath.match( /\.node\./ ) ) {
					modulesToProcess.push( modulePath.replace( '.node.', '.web.' ) );
				}
			} );

		calypsoModules = new Set( [ ...calypsoModules, ...result.calypsoModules ] );
		nodeModules = new Set( [ ...nodeModules, ...result.nodeModules ] );
	}

	[ ...calypsoModules, 'login' ].forEach( calypsoMod => {
		const modPath = getActualPath( calypsoMod );

		fsExtra.copy( 
			modPath, modPath.replace( PROJECT_DIR, OUTPUT_DIR )
		).catch( err => console.error( err, calypsoMod ) );
	} );
	console.log( 'calypsoModules', calypsoModules );
	console.log( 'nodeModules', nodeModules );
}

traverse();

