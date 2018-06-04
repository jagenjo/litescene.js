//when working with animations sometimes you want the bones to be referenced by node name and no node uid, because otherwise you cannot reuse
//the same animation with different characters in the same scene.
GL.Mesh.prototype.convertBoneNames = function( root_node, use_uids )
{
	if(!this.bones || !this.bones.length)
		return 0;

	root_node = root_node || LS.GlobalScene;
	if( root_node.constructor == LS.Scene  )
		root_node = root_node.root;
	if(!root_node.findNode)
	{
		console.error("convertBoneNames first parameter must be node or scene");
		return 0;
	}

	var modified = false;

	//Rename the id to a relative name
	for(var i = 0; i < this.bones.length; ++i)
	{
		var bone = this.bones[i];
		var bone_name = bone[0];

		if( !use_uids )
		{
			if( bone_name[0] != LS._uid_prefix)
				continue; //already using a name, not a uid
			var node = root_node.findNode( bone_name );
			if(!node)
			{
				console.warn("Bone node not found: " + bone_name );
				continue;
			}
			bone[0] = node.name;
			modified = true;
		}
		else
		{
			if( bone_name[0] == LS._uid_prefix)
				continue; //already using a uid
			var node = root_node.findNode( bone_name );
			if(!node)
			{
				console.warn("Bone node not found: " + bone_name );
				continue;
			}
			bone[0] = node.uid;
			modified = true;
		}
	}

	//flag it
	if(modified)
		LS.RM.resourceModified( this );
}