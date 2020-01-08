/*
var i = 1;
$('.progress .circle').removeClass().addClass('circle');
$('.progress .bar').removeClass().addClass('bar');
setInterval(function() {
  $('.progress .circle:nth-of-type(' + i + ')').addClass('active');
  
  $('.progress .circle:nth-of-type(' + (i-1) + ')').removeClass('active').addClass('done');
  
  $('.progress .circle:nth-of-type(' + (i-1) + ') .label').html('&#10003;');
  
  $('.progress .bar:nth-of-type(' + (i-1) + ')').addClass('active');
  
  $('.progress .bar:nth-of-type(' + (i-2) + ')').removeClass('active').addClass('done');
  
  i++;
  
  if (i==0) {
    $('.progress .bar').removeClass().addClass('bar');
    $('.progress div.circle').removeClass().addClass('circle');
    i = 1;
  }
}, 1000);
*/

function startChange(){
	var i = 1;
	$('.progress .bar').removeClass().addClass('bar');
    $('.progress div.circle').removeClass().addClass('circle');
	$('.progress .circle:nth-of-type(' + i + ')').addClass('active');
	setTimeout(function(){
		startUpload()
		
	},1000);
	
}

function startUpload(){
	var i = 2;
	document.getElementById("imgUpload").style.display = "block";
	$('.progress .bar').removeClass().addClass('bar');
    $('.progress div.circle').removeClass().addClass('circle');
	$('.progress .circle:nth-of-type(' + i + ')').addClass('active');
	 $('.progress .circle:nth-of-type(' + (i-1) + ')').removeClass('active').addClass('done');
  
  $('.progress .circle:nth-of-type(' + (i-1) + ') .label').html('&#10003;');
	setTimeout(function(){
		startClassify()
		
	},1500);
	
}

function startClassify(){
	var i = 3;
	
	$('.progress .bar').removeClass().addClass('bar');
    $('.progress div.circle').removeClass().addClass('circle');
	$('.progress .circle:nth-of-type(' + i + ')').addClass('active');
	 $('.progress .circle:nth-of-type(' + (i-1) + ')').removeClass('active').addClass('done');
  
  $('.progress .circle:nth-of-type(' + (i-1) + ') .label').html('&#10003;');
	
	setTimeout(function(){
		startExtract()
		
	},1500);
	
}

function startExtract(){
	var i = 4;
	
	$('.progress .bar').removeClass().addClass('bar');
    $('.progress div.circle').removeClass().addClass('circle');
	$('.progress .circle:nth-of-type(' + i + ')').addClass('active');
	 $('.progress .circle:nth-of-type(' + (i-1) + ')').removeClass('active').addClass('done');
  
  $('.progress .circle:nth-of-type(' + (i-1) + ') .label').html('&#10003;');
	startLoad("A");

	
	setTimeout(function(){
		startLoad("B");
		
	},200);
	
	setTimeout(function(){
		startLoad("C");
		
	},400);
	
	setTimeout(function(){
		startLoad("D");
		
	},600);
	
	setTimeout(function(){
		compExtract();
		document.getElementById("tabsContent1").style.display = "block";
		document.getElementById("tabsContent2").style.display = "block";
		document.getElementById("tabsContent3").style.display = "block";
		document.getElementById("tabsContent4").style.display = "block";
		
	},4000);
	
}

function compExtract(){
	var i = 5;
	
	$('.progress .bar').removeClass().addClass('bar');
    $('.progress div.circle').removeClass().addClass('circle');
	$('.progress .circle:nth-of-type(' + i + ')').addClass('active');
	 $('.progress .circle:nth-of-type(' + (i-1) + ')').removeClass('active').addClass('done');
  
  $('.progress .circle:nth-of-type(' + (i-1) + ') .label').html('&#10003;');
		document.getElementById("tabsContent1").style.display = "block";
		document.getElementById("tabsContent2").style.display = "block";
		document.getElementById("tabsContent3").style.display = "block";
		document.getElementById("tabsContent4").style.display = "block";
	
	
}

function startLoad(barType) {
  var current_progress = 0;
  var currentID = "#dynamic" + barType;
  var interval = setInterval(function() {
      current_progress += 5;
      $(currentID)
      .css("width", current_progress + "%")
      .attr("aria-valuenow", current_progress);      
      if (current_progress >= 100)
          clearInterval(interval);
  }, 200);
	
	//.text(current_progress + "% Complete");
}